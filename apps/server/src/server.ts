import Fastify from "fastify";
import cors from "@fastify/cors";

import { verifySupabaseJwt } from "./auth.js";
import { admin } from "./db.js";
import type { ConversationRow, MessageRow, Role } from "./types.js";
import { retrieveContext } from "./rag.js";
import { estimateTokensFromText, costFromTokens, getTogetherPricePerToken } from "./cost.js";
import { SAFE_REPLY, moderateTextOrAllow } from "./moderation.js";

const fastify = Fastify({ logger: true });

/** ---------- SPEED & MODEL ---------- */
const RAG_TIMEOUT_MS = Number(process.env.RAG_TIMEOUT_MS ?? 500);
const BRIEF_MAX_WORDS = Number(process.env.BRIEF_MAX_WORDS ?? 120);
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS ?? 10000);

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY!;
const TOGETHER_MODEL = process.env.TOGETHER_MODEL ?? "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";

const LONGFORM_SEGMENT_WORDS = Number(process.env.LONGFORM_SEGMENT_WORDS ?? 1200);
const SEGMENT_MAX_TOKENS = Number(process.env.SEGMENT_MAX_TOKENS ?? 4096);
const SEGMENT_DEADLINE_MS = Number(process.env.SEGMENT_DEADLINE_MS ?? 25_000);

if (!TOGETHER_API_KEY) {
  fastify.log.warn("TOGETHER_API_KEY is not set. Responses will fail.");
}

function briefSystem() {
  return `You are AeonForge.
Answer directly and concisely by default. Prefer short, actionable replies under ~${BRIEF_MAX_WORDS} words for quick questions.
When the user explicitly requests long-form content (e.g., "write 4000 words"), produce cohesive, detailed prose at that length without filler, repetition, or meta commentary.`;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "");
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function tail(text: string, chars = 800): string {
  if (text.length <= chars) return text;
  return text.slice(-chars);
}

function abortAfter(ms: number, parent?: AbortSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  if (parent) parent.addEventListener("abort", () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}

/** ---------- Together helpers ---------- */
async function togetherOnce(messages: any[], { signal }: { signal?: AbortSignal } = {}) {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOGETHER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: SEGMENT_MAX_TOKENS,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Together HTTP ${res.status}: ${t}`);
  }
  const j = await res.json();
  const content: string = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? "";
  const usage = j?.usage ?? {};
  return { text: stripThink(content), usage };
}

async function* togetherStream(messages: any[], { signal }: { signal?: AbortSignal } = {}) {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOGETHER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: SEGMENT_MAX_TOKENS,
      stream: true,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`Together stream HTTP ${res.status}: ${t}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    carry += chunk;

    for (;;) {
      const idx = carry.indexOf("\n\n");
      if (idx === -1) break;
      const block = carry.slice(0, idx);
      carry = carry.slice(idx + 2);

      for (const line of block.split("\n")) {
        const s = line.trim();
        if (!s || s.startsWith(":")) continue;
        if (!s.startsWith("data:")) continue;
        const payload = line.slice(5);
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const piece =
            j?.choices?.[0]?.delta?.content ??
            j?.choices?.[0]?.text ?? "";
          if (piece) yield stripThink(piece);
        } catch {}
      }
    }
  }
}

/** ---------- CORS ---------- */
fastify.register(cors, {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const isLocal = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    const isVercel = /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/.test(origin);
    cb(null, isLocal || isVercel);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});

fastify.get("/healthz", async () => ({ ok: true }));

/** ---------- AUTH HOOK ---------- */
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
    (req as any).user = payload;
  } catch {
    reply.code(401).send({ error: "Invalid token" });
    return;
  }
});

/** ---------- Conversations ---------- */
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

/** ---------- Messages ---------- */
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

fastify.post<{ Params: { id: string }; Body: { role: Role; content: string } }>(
  "/conversations/:id/messages",
  async (req, reply) => {
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
  }
);

/** ---------- RAG helper ---------- */
async function safeRetrieveContext(userId: string, q: string) {
  return await withTimeout(retrieveContext(userId, q), RAG_TIMEOUT_MS, "");
}

/** ---------- Non-streaming Chat (Together-only, hardened) ---------- */
fastify.post<{ Body: { conversationId?: string | null; text: string; targetWords?: number } }>(
  "/chat",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const { conversationId, text, targetWords } = req.body ?? {};
    const q = (text ?? "").trim();

    // conversation bootstrap (best-effort)
    let convId = conversationId ?? null;
    try {
      if (!convId) {
        const { data: newConv } = await admin
          .from("conversations")
          .insert({ user_id: userId, title: q.slice(0, 60) || "New chat" })
          .select()
          .single();
        if (newConv) convId = newConv.id;
      } else {
        const { data: c } = await admin.from("conversations").select("id,user_id").eq("id", convId).single();
        if (!c || c.user_id !== userId) convId = null;
      }
    } catch {}

    // log user message (best-effort)
    try { await admin.from("messages").insert({ conversation_id: convId ?? null, role: "user", content: q }); } catch {}

    // moderation (best-effort allow)
    let blocked = false;
    try { blocked = (await moderateTextOrAllow(q)) === "block"; } catch {}
    if (blocked) {
      const safe = SAFE_REPLY;
      try { await admin.from("messages").insert({ conversation_id: convId ?? null, role: "assistant", content: safe }); } catch {}
      try {
        await admin.from("request_logs").insert({
          user_id: userId, model: "cloud", tokens_in: 0, tokens_out: 0, latency_ms: 0, success: true, cost_usd: 0
        });
      } catch {}
      return { conversationId: convId, text: safe };
    }

    // RAG (best-effort)
    const context = await safeRetrieveContext(userId, q);
    const system = context
      ? `${briefSystem()}\n\nCONTEXT:\n${context}\n\nIgnore context if irrelevant.`
      : briefSystem();

    // Together call (no router)
    const t0 = Date.now();
    let resultText = "Sorry—no response was generated.";
    let tokens_in = estimateTokensFromText(system) + estimateTokensFromText(q);
    let tokens_out = 0;

    try {
      const promptUser = targetWords
        ? `${q}\n\n(If applicable, write approximately ${Math.min(targetWords, 20000)} words without filler or repetition.)`
        : q;

      const { text: out, usage } = await togetherOnce(
        [
          { role: "system", content: system },
          { role: "user", content: promptUser },
        ]
      );
      resultText = out || resultText;
      if (usage) {
        tokens_in = usage.prompt_tokens ?? tokens_in;
        tokens_out = usage.completion_tokens ?? estimateTokensFromText(resultText);
      } else {
        tokens_out = estimateTokensFromText(resultText);
      }
    } catch (e: any) {
      resultText = `Sorry—upstream error: ${e?.message || e}`;
    }

    try { await admin.from("messages").insert({ conversation_id: convId ?? null, role: "assistant", content: resultText }); } catch {}

    // cost logging (best-effort)
    try {
      const p = await getTogetherPricePerToken(TOGETHER_MODEL);
      const cost_usd = costFromTokens(tokens_in, tokens_out, p);
      await admin.from("request_logs").insert({
        user_id: userId,
        model: "cloud",
        tokens_in, tokens_out,
        latency_ms: Date.now() - t0,
        success: true,
        cost_usd,
      });
    } catch {}

    return { conversationId: convId, text: resultText };
  }
);

/** ---------- Streaming Chat (Together + long-form segmentation) ---------- */
/* KEEP ONLY THIS ONE streaming route */
fastify.post<{ Body: { conversationId?: string | null; text: string; targetWords?: number | null } }>(
  "/chat/stream",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const { conversationId, text, targetWords } = req.body ?? {};
    const q = (text ?? "").trim();
    if (!q) { reply.code(400); return { error: "Missing 'text'." }; }

    // Ensure conversation
    let convId = conversationId ?? null;
    try {
      if (!convId) {
        const { data: newConv } = await admin
          .from("conversations")
          .insert({ user_id: userId, title: q.slice(0, 60) })
          .select()
          .single();
        if (newConv) convId = newConv.id;
      } else {
        const { data: c } = await admin.from("conversations").select("id,user_id").eq("id", convId).single();
        if (!c || c.user_id !== userId) convId = null;
      }
    } catch {}

    try { await admin.from("messages").insert({ conversation_id: convId ?? null, role: "user", content: q }); } catch {}

    let blocked = false;
    try { blocked = (await moderateTextOrAllow(q)) === "block"; } catch {}
    if (blocked) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(`event: status\ndata: blocked\n\n`);
      reply.raw.write(`data: ${SAFE_REPLY}\n\n`);
      try { reply.raw.end(); } catch {}
      return;
    }

    // Start SSE
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(":ok\n\n");
    reply.raw.write("event: status\ndata: retrieving\n\n");

    const ctx = await safeRetrieveContext(userId, q);
    const baseSystem = ctx
      ? `${briefSystem()}\n\nCONTEXT:\n${ctx}\n\nIgnore context if irrelevant.`
      : briefSystem();

    reply.raw.write("event: status\ndata: generating\n\n");

    // Heartbeat
    const heartbeat = setInterval(() => {
      try { reply.raw.write(":hb\n\n"); } catch {}
    }, SSE_HEARTBEAT_MS);

    const wantWords = typeof targetWords === "number" && targetWords > 0 ? Math.min(targetWords, 20000) : 0;
    let accumulated = "";
    let written = 0;
    let segmentIndex = 0;

    const firstChunkWords = wantWords ? Math.min(LONGFORM_SEGMENT_WORDS, wantWords) : 0;

    async function streamOnePrompt(prompt: string, system = baseSystem, parentAbort?: AbortSignal) {
      const { signal, cancel } = abortAfter(SEGMENT_DEADLINE_MS, parentAbort);
      try {
        for await (const piece of togetherStream(
          [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          { signal }
        )) {
          if (!piece) continue;
          accumulated += piece;
          written += wordCount(piece);
          for (const line of piece.replace(/\r?\n/g, "\n").split("\n")) {
            if (line === "") continue;
            reply.raw.write(`data: ${line}\n\n`);
          }
        }
      } finally {
        cancel();
      }
    }

    try {
      // First segment
      const firstPrompt = firstChunkWords
        ? `${q}\n\nPlease write ~${firstChunkWords} words of cohesive, high-quality prose. Avoid filler and repetition.`
        : q;

      segmentIndex += 1;
      reply.raw.write(`event: status\ndata: segment-${segmentIndex}\n\n`);
      await streamOnePrompt(firstPrompt);

      // Additional segments if longform requested
      while (wantWords && written < wantWords) {
        const remain = wantWords - written;
        const goal = Math.min(LONGFORM_SEGMENT_WORDS, remain);
        const lastTail = tail(accumulated, 1200);

        segmentIndex += 1;
        reply.raw.write(`event: status\ndata: segment-${segmentIndex}\n\n`);

        const continuePrompt =
          `Continue seamlessly from the previous text without repeating or reintroducing the topic.\n` +
          `Write the next ~${goal} words, maintaining tone, structure, and coherence.\n` +
          `Here are the last lines for continuity:\n"""${lastTail}"""\n`;

        await streamOnePrompt(continuePrompt);
      }
    } catch (e) {
      fastify.log.error(e);
    } finally {
      clearInterval(heartbeat);
      reply.raw.write("event: status\ndata: done\n\n");
      try { reply.raw.end(); } catch {}
    }

    const finalText = accumulated.trim();
    if (finalText) {
      try { await admin.from("messages").insert({ conversation_id: convId ?? null, role: "assistant", content: finalText }); } catch {}
    }

    // Log (estimate for streaming)
    const tokens_in = estimateTokensFromText(baseSystem) + estimateTokensFromText(q);
    const tokens_out = estimateTokensFromText(finalText);
    let cost_usd = 0;
    try {
      const p = await getTogetherPricePerToken(TOGETHER_MODEL);
      cost_usd = costFromTokens(tokens_in, tokens_out, p);
      await admin.from("request_logs").insert({
        user_id: userId,
        model: "cloud",
        tokens_in,
        tokens_out,
        latency_ms: Math.max(1, Math.round(tokens_out / 3)),
        success: true,
        cost_usd,
      });
    } catch {}

    return;
  }
);

const PORT = Number(process.env.PORT ?? 8787);
fastify
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`API listening on http://localhost:${PORT}`))
  .catch((err) => { fastify.log.error(err); process.exit(1); });
