import Fastify from "fastify";
import cors from "@fastify/cors";

// Auth / DB
import { verifySupabaseJwt } from "./auth.js";
import { admin } from "./db.js";

// Types
import type { ConversationRow, MessageRow, Role, ChatMessage } from "./types.js";

// Routing + Moderation + Costing
import { routeGenerateWithHistory, routeGenerateStreamWithMeta } from "./router.js";
import { moderateTextOrAllow, SAFE_REPLY } from "./moderation.js";
import { estimateTokensFromText, costFromTokens, getTogetherPricePerToken } from "./cost.js";

// Optional RAG text ingest (kept)
import { ingestTextDocument } from "./rag.js";

const fastify = Fastify({ logger: true });

/* CORS */
fastify.register(cors, {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

/* Health */
fastify.get("/healthz", async () => ({ ok: true }));

/* Auth hook (skip for /healthz) */
fastify.addHook("preHandler", async (req, reply) => {
  if (req.routerPath === "/healthz") return;
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

/* ---------------- Conversations ---------------- */

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

/* ---------------- Messages ---------------- */

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

/* ---------------- RAG Ingest (text) ---------------- */
fastify.post<{ Body: { text: string; filename?: string | null } }>("/rag/ingest", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { text, filename } = req.body ?? {};
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    return reply.code(400).send({ error: "Provide 'text' with at least 10 characters." });
  }
  try {
    const result = await ingestTextDocument(userId, text, filename ?? undefined);
    return result;
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message ?? "Ingest failed" });
  }
});

/* ---------------- Chat (non-streaming) ----------------
   Accepts optional hints:
     - mode?: "coding" | "general"
     - targetWords?: number
*/
fastify.post<{ Body: { conversationId?: string | null; text: string; targetWords?: number | null; mode?: "coding" | "general" } }>(
  "/chat",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const { conversationId, text, targetWords, mode } = req.body;
    const q = text?.trim() ?? "";
    if (!q) return reply.code(400).send({ error: "Missing 'text'." });

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

    // Safety moderation
    const allow = await moderateTextOrAllow(q);
    if (!allow) {
      await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });
      await admin.from("messages").insert({ conversation_id: convId, role: "assistant", content: SAFE_REPLY });
      return { conversationId: convId, text: SAFE_REPLY };
    }

    // Insert user message
    await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });

    // Load history (includes just-inserted user message)
    const { data: rows } = await admin
      .from("messages")
      .select("role,content,created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    const history: ChatMessage[] = (rows ?? []).map(r => ({ role: r.role as Role, content: r.content }));

    const system = `You are AeonForge. Be helpful, accurate, and conversational. Maintain dialogue continuity with prior turns.`;

    const t0 = Date.now();
    const r = await routeGenerateWithHistory(
      system,
      history.slice(0, -1), // pass prior turns; latest user is "q"
      q,
      { targetWords: targetWords ?? undefined, mode: mode ?? undefined }
    );
    const resultText = r.text;

    // Store assistant message
    await admin.from("messages").insert({ conversation_id: convId!, role: "assistant", content: resultText });

    // ---- Cost logging ----
    const inputText = system + "\n" + history.map(m => `${m.role}: ${m.content}`).join("\n");
    const tokens_in  = r.tokens_in  ?? estimateTokensFromText(inputText);
    const tokens_out = r.tokens_out ?? estimateTokensFromText(resultText);
    let cost_usd = 0;

    if (r.provider === "together" && r.model) {
      try {
        const p = await getTogetherPricePerToken(r.model);
        cost_usd = costFromTokens(tokens_in, tokens_out, p);
      } catch {}
    }

    await admin.from("request_logs").insert({
      user_id: userId,
      model: "cloud", // do NOT leak exact model
      tokens_in,
      tokens_out,
      latency_ms: Date.now() - t0,
      success: r.success,
      cost_usd,
    });

    return { conversationId: convId, text: resultText };
  }
);

/* ---------------- Chat (streaming) ----------------
   Accepts optional hints:
     - mode?: "coding" | "general"
     - targetWords?: number
*/
fastify.post<{ Body: { conversationId?: string | null; text: string; targetWords?: number | null; mode?: "coding" | "general" } }>(
  "/chat/stream",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const { conversationId, text, targetWords, mode } = req.body ?? {};
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

    // Safety moderation
    const allow = await moderateTextOrAllow(q);
    if (!allow) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      reply.raw.write(SAFE_REPLY);
      try { reply.raw.end(); } catch {}
      await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });
      await admin.from("messages").insert({ conversation_id: convId, role: "assistant", content: SAFE_REPLY });
      return;
    }

    // Insert user message
    await admin.from("messages").insert({ conversation_id: convId, role: "user", content: q });

    // Load history (includes just-inserted user message)
    const { data: rows } = await admin
      .from("messages")
      .select("role,content,created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    const history: ChatMessage[] = (rows ?? []).map(r => ({ role: r.role as Role, content: r.content }));

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
    let provider: "together" | "echo" = "echo";
    let togetherModelId: string | undefined;

    try {
      const { provider: p, modelId, stream } = await routeGenerateStreamWithMeta(
        `You are AeonForge. Be helpful, accurate, and conversational. Maintain dialogue continuity with prior turns.`,
        history.slice(0, -1), // pass prior turns; latest user is "q"
        q,
        aborter.signal,
        { targetWords: targetWords ?? undefined, mode: mode ?? undefined }
      );
      provider = p;
      togetherModelId = modelId;

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

    // ---- Cost logging (estimate for streaming) ----
    const inputText = history.map(m => `${m.role}: ${m.content}`).join("\n");
    const tokens_in = estimateTokensFromText(inputText);
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
      model: "cloud", // hide exact model from clients
      tokens_in,
      tokens_out,
      latency_ms: Date.now() - t0,
      success,
      cost_usd,
    });

    return; // stream already sent
  }
);

/* ---------------- Start ---------------- */

const PORT = Number(process.env.PORT ?? 8787);
fastify
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`API listening on http://localhost:${PORT}`))
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
