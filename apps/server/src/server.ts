import Fastify from "fastify";
import cors from "@fastify/cors";
import { verifySupabaseJwt } from "./auth";
import { admin } from "./db";
import type { ConversationRow, MessageRow, Role } from "./types";

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: "http://localhost:3000",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
});

fastify.get("/healthz", async () => ({ ok: true }));

// Auth hook (skip for healthz)
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

// -------- Conversations --------

// Create a conversation (optional: with initial title)
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

// List conversations for current user (latest first)
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

// -------- Messages --------

// Get messages in a conversation (chronological)
fastify.get<{ Params: { id: string } }>("/conversations/:id/messages", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const convoId = req.params.id;

  // Ensure user owns the conversation (cheap check)
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

// Append a message (user or assistant)
fastify.post<{
  Params: { id: string };
  Body: { role: Role; content: string };
}>("/conversations/:id/messages", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const convoId = req.params.id;
  const { role, content } = req.body;

  // Ownership check
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

// -------- Chat (echo + persistence) --------

// Accepts { conversationId?, text }.
// If conversationId missing, creates one. Stores user msg then assistant reply.
fastify.post<{ Body: { conversationId?: string | null; text: string } }>("/chat", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { conversationId, text } = req.body;

  // 1) Ensure conversation
  let convId = conversationId ?? null;
  if (!convId) {
    const { data: newConv, error: convErr } = await admin
      .from("conversations")
      .insert({ user_id: userId, title: text.slice(0, 60) })
      .select()
      .single();
    if (convErr || !newConv) return reply.code(500).send({ error: convErr?.message ?? "conv create failed" });
    convId = newConv.id;
  } else {
    // quick ownership check
    const { data: c, error: ce } = await admin
      .from("conversations")
      .select("id,user_id")
      .eq("id", convId)
      .single();
    if (ce || !c || c.user_id !== userId) return reply.code(404).send({ error: "Conversation not found" });
  }

  // 2) Insert user message
  const { error: uErr } = await admin
    .from("messages")
    .insert({ conversation_id: convId, role: "user", content: text });
  if (uErr) return reply.code(500).send({ error: uErr.message });

  // 3) Produce assistant message (echo for now)
  const assistant = `Echo: ${text}`;

  const { error: aErr } = await admin
    .from("messages")
    .insert({ conversation_id: convId, role: "assistant", content: assistant });
  if (aErr) return reply.code(500).send({ error: aErr.message });

  return { conversationId: convId, text: assistant };
});

const PORT = Number(process.env.PORT ?? 8787);
fastify
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`API listening on http://localhost:${PORT}`))
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
