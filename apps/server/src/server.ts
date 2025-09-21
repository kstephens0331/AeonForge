import Fastify from "fastify";
import cors from "@fastify/cors";

import { verifySupabaseJwt } from "./auth.js";
import { admin } from "./db.js";
import type { ConversationRow, MessageRow, Role } from "./types.js";
import { routeGenerate, routeGenerateStreamWithMeta } from "./router.js";
import { retrieveContext } from "./rag.js";
import { estimateTokensFromText, costFromTokens, getTogetherPricePerToken } from "./cost.js";
import { SAFE_REPLY, moderateTextOrAllow } from "./moderation.js";

const fastify = Fastify({ logger: true });

/** CORS FIRST — allow localhost and any *.vercel.app (previews + prod) */
fastify.register(cors, {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/health checks
    const isLocal = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    const isVercel = /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/.test(origin);
    cb(null, isLocal || isVercel);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});

fastify.get("/healthz", async () => ({ ok: true }));

/** Auth hook: skip preflights & healthz so CORS headers get set */
fastify.addHook("preHandler", async (req, reply) => {
  if (req.method === "OPTIONS") return;
  if (req.url === "/healthz") return;

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing bearer token" });
    return;
  }
  const token = auth.slice("Bearer ".length);
  try {
    const payload = await verifySupabaseJwt(token);
    (req as any).user = payload; // { sub, email, ... }
  } catch {
    reply.code(401).send({ error: "Invalid token" });
  }
});

/** -------- Conversations -------- */

fastify.post<{ Body: { title?: string | null } }>("/conversations", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { title = null } = req.body ?? {};
  const { data, error } = await admin
    .from("conversations")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) return reply.code(500).send({ error: error.message });
  return { conversation: data as ConversationRow };
});

fastify.get("/conversations", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { data, error } = await admin
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return reply.code(500).send({ error: error.message });
  return { conversations: (data ?? []) as ConversationRow[] };
});

/** -------- Messages -------- */

fastify.get<{ Params: { id: string } }>("/conversations/:id/messages", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const convoId = req.params.id;

  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id,user_id")
    .eq("id", convoId)
    .single();
  if (convoErr || !convo || convo.user_id !== userId) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  const { data, error } = await admin
    .from("messages")
    .select("*")
    .eq("conversation_id", convoId)
    .order("created_at", { ascending: true });
  if (error) return reply.code(500).send({ error: error.message });
  return { messages: (data ?? []) as MessageRow[] };
});

fastify.post<{
  Params: { id: string };
  Body: { role: Role; content: string };
}>("/conversations/:id/messages", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const convoId = req.params.id;
  const { role, content } = req.body;

  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id,user_id")
    .eq("id", convoId)
    .single();
  if (convoErr || !convo || convo.user_id !== userId) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  const { data, error } = await admin
    .from("messages")
    .insert({ conversation_id: convoId, role, content })
    .select()
    .single();
  if (error) return reply.code(500).send({ error: error.message });
  return { message: data as MessageRow };
});

/** -------- RAG Ingest -------- */
fastify.post<{ Body: { text: string; filename?: string | null } }>("/rag/ingest", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { text, filename } = req.body ?? {};
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    return reply.code(400).send({ error: "Provide 'text' with at least 10 characters." });
  }
  const fname = filename && filename.trim() ? filename.trim() : `text-${new Date().toISOString()}.txt`;
  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: userId,
      filename: fname,
      mime_type: "text/plain",
      byte_size: text.length,
    })
    .select()
    .single();
  if (docErr || !doc) {
    return reply.code(500).send({ error: docErr?.message ?? "Failed to create document" });
  }

  function chunkText(s: string, target = 700): string[] {
    const paragraphs = s.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const out: string[] = [];
    let buf = "";
    const flush = () => { const b = buf.trim(); if (b) out.push(b); buf = ""; };
    const push = (piece: string) => {
      if ((buf + " " + piece).trim().length > target) { flush(); buf = piece; } else { buf = (buf ? buf + " " : "") + piece; }
    };
    for (const p of paragraphs) {
      if (p.length <= target) { push(p); continue; }
      for (const snt of p.split(/(?<=[\.\!\?])\s+/)) {
        if (snt.length <= target) { push(snt); }
        else {
          let cur = "";
          for (const w of snt.split(/\s+/)) {
            if ((cur + " " + w).trim().length > target) { push(cur); cur = w; } else { cur = (cur ? cur + " " : "") + w; }
          }
          if (cur) push(cur);
        }
      }
    }
    flush();
    return out;
  }

  const pieces = chunkText(text);

  // optional: embed chunks if Together key present
  let embeddings: number[][] | null = null;
  try {
    if (process.env.TOGETHER_API_KEY) {
      const { togetherEmbed } = await import("./models/together.js");
      embeddings = await togetherEmbed(pieces);
    }
  } catch (e: any) {
    fastify.log.warn({ msg: "embed_failed", error: e?.message });
    embeddings = null;
  }

  const rows = pieces.map((content, idx) => ({
    document_id: doc.id, user_id: userId, chunk_index: idx, content,
    embedding: embeddings ? embeddings[idx] : null
  }));
  const { error: chErr } = await admin.from("doc_chunks").insert(rows);
  if (chErr) return reply.code(500).send({ error: chErr.message });

  return { documentId: doc.id, filename: doc.filename, chunks: pieces.length, embedded: Boolean(embeddings) };
});

/** -------- Non-streaming Chat -------- */
fastify.post<{ Body: { conversationId?: string | null; text: string } }>("/chat", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { conversationId, text } = req.body;
  const q = text?.trim() ?? "";

  // Ensure conversation
  let convId = conversationId ?? null;
  if (!convId) {
    const { data: newConv, error: convErr } = await admin
      .from("conversations")
      .insert({ user_id: userId, title: q.slice(0, 60) })
      .select()
      .single();
    if (convErr || !newConv) return reply.code(500).send({ error: convErr?.message ?? "conv create failed" });
    convId = newConv.id;
  } else {
    const { data: c, error: ce } = await admin.from("conversations").select("id,user_id").eq("id", convId).single();
    if (ce || !c || c.user_id !== userId) return reply.code(404).send({ error: "Conversation not found" });
  }

  await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });

  // Moderation (never dead-end)
  const verdict = await moderateTextOrAllow(q);
  if (verdict === "block") {
    await admin.from("messages").insert({ conversation_id: convId!, role: "assistant", content: SAFE_REPLY });
    await admin.from("request_logs").insert({
      user_id: userId, model: "cloud", tokens_in: 0, tokens_out: 0, latency_ms: 0, success: true, cost_usd: 0
    });
    return { conversationId: convId, text: SAFE_REPLY };
  }

  // RAG context
  const context = await retrieveContext(userId, q);
  const system = context
    ? `You are AeonForge. Use the CONTEXT below if relevant.\n\nCONTEXT:\n${context}\n\nIf not relevant, ignore.`
    : `You are AeonForge. Answer clearly and concisely.`;

  const t0 = Date.now();
  const r = await routeGenerate(system, q);
  const resultText = r.text;

  // Store assistant message
  await admin.from("messages").insert({ conversation_id: convId!, role: "assistant", content: resultText });

  // Cost logging
  let tokens_in = r.tokens_in ?? estimateTokensFromText(system) + estimateTokensFromText(q);
  let tokens_out = r.tokens_out ?? estimateTokensFromText(resultText);
  let cost_usd = 0;

  if (r.provider === "together" && r.model) {
    try {
      const p = await getTogetherPricePerToken(r.model);
      cost_usd = costFromTokens(tokens_in, tokens_out, p);
    } catch {}
  }

  await admin.from("request_logs").insert({
    user_id: userId,
    model: r.provider === "together" ? "cloud" : r.provider,
    tokens_in,
    tokens_out,
    latency_ms: Date.now() - t0,
    success: r.success,
    cost_usd,
  });

  return { conversationId: convId, text: resultText };
});

/** -------- Streaming Chat -------- */
fastify.post<{ Body: { conversationId?: string | null; text: string } }>("/chat/stream", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { conversationId, text } = req.body ?? {};
  const q = (text ?? "").trim();
  if (!q) {
    reply.code(400);
    return { error: "Missing 'text'." };
  }

  // Ensure conversation
  let convId = conversationId ?? null;
  if (!convId) {
    const { data: newConv, error: convErr } = await admin
      .from("conversations")
      .insert({ user_id: userId, title: q.slice(0, 60) })
      .select()
      .single();
    if (convErr || !newConv) return reply.code(500).send({ error: convErr?.message ?? "conv create failed" });
    convId = newConv.id;
  } else {
    const { data: c, error: ce } = await admin.from("conversations").select("id,user_id").eq("id", convId).single();
    if (ce || !c || c.user_id !== userId) return reply.code(404).send({ error: "Conversation not found" });
  }

  // Insert user message
  await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });

  // Moderation (block before opening stream)
  const verdict = await moderateTextOrAllow(q);
  if (verdict === "block") {
    await admin.from("messages").insert({ conversation_id: convId!, role: "assistant", content: SAFE_REPLY });
    await admin.from("request_logs").insert({
      user_id: userId, model: "cloud", tokens_in: 0, tokens_out: 0, latency_ms: 0, success: true, cost_usd: 0
    });
    return reply.send(SAFE_REPLY);
  }

  // Compose system with RAG
  const context = await retrieveContext(userId, q);
  const system = context
    ? `You are AeonForge. Use the CONTEXT below if relevant.\n\nCONTEXT:\n${context}\n\nIf not relevant, ignore.`
    : `You are AeonForge. Answer clearly and concisely.`;

  // Prepare streaming response
  reply.raw.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  // Abort handling
  const aborter = new AbortController();
  const onClose = () => aborter.abort();
  reply.raw.on("close", onClose);
  reply.raw.on("error", onClose);

  const t0 = Date.now();
  let accumulated = "";
  let success = false;
  let provider: "local" | "together" | "echo" = "echo";
  let togetherModelId: string | undefined;

  try {
    const { provider: p, modelId, stream } = await routeGenerateStreamWithMeta(system, q, aborter.signal);
    provider = p; togetherModelId = modelId;

    for await (const delta of stream) {
      if (aborter.signal.aborted) break;
      accumulated += delta;
      reply.raw.write(delta);
    }
    success = true;
  } catch {
    // swallow; client may have aborted
  } finally {
    try { reply.raw.end(); } catch {}
    reply.raw.off("close", onClose);
    reply.raw.off("error", onClose);
  }

  // Store assistant message if any text
  if (accumulated.trim().length > 0) {
    await admin.from("messages").insert({
      conversation_id: convId!,
      role: "assistant",
      content: accumulated,
    });
  }

  // Estimated cost logging for streaming
  const tokens_in = estimateTokensFromText(system) + estimateTokensFromText(q);
  const tokens_out = estimateTokensFromText(accumulated);
  let cost_usd = 0;

  if (provider === "together" && togetherModelId) {
    try {
      const p = await getTogetherPricePerToken(togetherModelId);
      cost_usd = costFromTokens(tokens_in, tokens_out, p);
    } catch {}
  }

  await admin.from("request_logs").insert({
    user_id: userId,
    model: provider === "together" ? "cloud" : provider,
    tokens_in,
    tokens_out,
    latency_ms: Date.now() - t0,
    success,
    cost_usd,
  });

  return; // stream already sent
});

const PORT = Number(process.env.PORT ?? 8787);
fastify
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`API listening on http://localhost:${PORT}`))
  .catch((err) => { fastify.log.error(err); process.exit(1); });
