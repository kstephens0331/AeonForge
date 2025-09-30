import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";

// Auth / DB
import { verifySupabaseJwt } from "./auth.js";
import { admin } from "./db.js";

// Types
import type { ConversationRow, MessageRow, Role, ChatMessage } from "./types.js";

// Routing + Moderation + Costing
import { routeGenerateWithHistory, routeGenerateStreamWithMeta } from "./router.js";
import { moderateTextOrAllow, SAFE_REPLY } from "./moderation.js";
import { estimateTokensFromText, costFromTokens, getTogetherPricePerToken } from "./cost.js";

// RAG text ingest + retrieval
import { ingestTextDocument, retrieveContext } from "./rag.js";

// Vision/multimodal
import { analyzeImage, bufferToDataUri } from "./models/vision.js";

// File processing
import { processFile } from "./fileProcessors.js";

// Search
import { unifiedSearch, searchConversations, searchMessages } from "./search.js";

// Rate limiting
import { checkRateLimit, getQuotaUsage } from "./rateLimit.js";

// Export
import { exportMarkdown, exportJSON, exportText, exportHTML } from "./export.js";

// Enhanced system prompts
import { getSystemPrompt, enhanceCustomPrompt } from "./systemPrompts.js";

const fastify = Fastify({ logger: true });

/* CORS */
fastify.register(cors, {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

/* Multipart support for file uploads */
fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
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

/* Rate limiting hook for chat endpoints */
fastify.addHook("preHandler", async (req, reply) => {
  const chatEndpoints = ["/chat", "/chat/stream"];
  if (!chatEndpoints.includes(req.routerPath)) return;

  const userId = (req as any).user?.sub as string;
  if (!userId) return; // Auth hook will catch this

  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    reply.code(429).headers({
      "Retry-After": rateCheck.retryAfter?.toString() ?? "3600",
    });
    reply.send({ error: rateCheck.reason ?? "Rate limit exceeded" });
  }
});

/* ---------------- Conversations ---------------- */

fastify.post<{ Body: { title?: string | null; system_prompt?: string | null } }>("/conversations", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { title = null, system_prompt = null } = req.body ?? {};
  const { data, error } = await admin
    .from("conversations")
    .insert({ user_id: userId, title, system_prompt })
    .select()
    .single();
  if (error) return reply.code(500).send({ error: error.message });
  return { conversation: data as ConversationRow };
});

/* Update conversation (title or system prompt) */
fastify.patch<{
  Params: { id: string };
  Body: { title?: string | null; system_prompt?: string | null };
}>("/conversations/:id", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const convoId = req.params.id;
  const { title, system_prompt } = req.body ?? {};

  // Verify ownership
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id,user_id")
    .eq("id", convoId)
    .single();

  if (convoErr || !convo || convo.user_id !== userId) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt;

  if (Object.keys(updates).length === 0) {
    return reply.code(400).send({ error: "No fields to update" });
  }

  const { data, error } = await admin
    .from("conversations")
    .update(updates)
    .eq("id", convoId)
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

/* Edit message */
fastify.patch<{
  Params: { conversationId: string; messageId: string };
  Body: { content: string };
}>("/conversations/:conversationId/messages/:messageId", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { conversationId, messageId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return reply.code(400).send({ error: "Content cannot be empty" });
  }

  // Verify conversation ownership
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id,user_id")
    .eq("id", conversationId)
    .single();

  if (convoErr || !convo || convo.user_id !== userId) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  // Update message
  const { data, error } = await admin
    .from("messages")
    .update({ content })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .select()
    .single();

  if (error) return reply.code(500).send({ error: error.message });
  if (!data) return reply.code(404).send({ error: "Message not found" });

  return { message: data as MessageRow };
});

/* Delete message */
fastify.delete<{ Params: { conversationId: string; messageId: string } }>(
  "/conversations/:conversationId/messages/:messageId",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const { conversationId, messageId } = req.params;

    // Verify conversation ownership
    const { data: convo, error: convoErr } = await admin
      .from("conversations")
      .select("id,user_id")
      .eq("id", conversationId)
      .single();

    if (convoErr || !convo || convo.user_id !== userId) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    // Delete message
    const { error } = await admin
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("conversation_id", conversationId);

    if (error) return reply.code(500).send({ error: error.message });

    return { success: true };
  }
);

/* Regenerate assistant response */
fastify.post<{
  Params: { conversationId: string; messageId: string };
  Body: { targetWords?: number | null; mode?: "coding" | "general" };
}>("/conversations/:conversationId/messages/:messageId/regenerate", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const { conversationId, messageId } = req.params;
  const { targetWords, mode } = req.body ?? {};

  // Verify conversation ownership
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id,user_id")
    .eq("id", conversationId)
    .single();

  if (convoErr || !convo || convo.user_id !== userId) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  // Get the message to regenerate (must be assistant message)
  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .select("id,role,created_at")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (msgErr || !msg) {
    return reply.code(404).send({ error: "Message not found" });
  }

  if (msg.role !== "assistant") {
    return reply.code(400).send({ error: "Can only regenerate assistant messages" });
  }

  // Get history up to the message before this one
  const { data: rows } = await admin
    .from("messages")
    .select("role,content,created_at")
    .eq("conversation_id", conversationId)
    .lt("created_at", msg.created_at)
    .order("created_at", { ascending: true });

  const history: ChatMessage[] = (rows ?? []).map(r => ({ role: r.role as Role, content: r.content }));

  // Get the user message (last message in history)
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return reply.code(400).send({ error: "Cannot regenerate: no user message found" });
  }

  const userText = history[history.length - 1].content;

  // Retrieve RAG context
  let ragContext = "";
  try {
    const chunks = await retrieveContext(userId, userText, { topK: 3, useKeywordFallback: true });
    if (chunks.length > 0) {
      ragContext = "\n\nRelevant context from your documents:\n" +
        chunks.map((c, i) => `[${i + 1}] From "${c.filename}":\n${c.content}`).join("\n\n");
    }
  } catch (e: any) {
    console.warn("[regenerate] RAG retrieval failed:", e?.message ?? e);
  }

  // Use enhanced system prompt
  const system = `${getSystemPrompt("default")}${ragContext}`;

  // Generate new response
  const t0 = Date.now();
  const r = await routeGenerateWithHistory(
    system,
    history.slice(0, -1), // exclude the user message we're responding to
    userText,
    { targetWords: targetWords ?? undefined, mode: mode ?? undefined }
  );
  const resultText = r.text;

  // Update the message with new content
  const { data: updated, error: updateErr } = await admin
    .from("messages")
    .update({ content: resultText })
    .eq("id", messageId)
    .select()
    .single();

  if (updateErr) return reply.code(500).send({ error: updateErr.message });

  return { message: updated as MessageRow, regenerated: true };
});

/* ---------------- Search ---------------- */
fastify.get<{ Querystring: { q: string } }>("/search", async (req, reply) => {
  const userId = (req as any).user?.sub as string;
  const query = req.query?.q ?? "";

  if (!query || query.trim().length < 2) {
    return reply.code(400).send({ error: "Query must be at least 2 characters" });
  }

  try {
    const results = await unifiedSearch(userId, query.trim());
    return results;
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message ?? "Search failed" });
  }
});

/* ---------------- Quota Usage ---------------- */
fastify.get("/quota", async (req, reply) => {
  const userId = (req as any).user?.sub as string;

  try {
    const usage = await getQuotaUsage(userId);
    return usage;
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message ?? "Failed to get quota" });
  }
});

/* ---------------- Export Conversations ---------------- */
fastify.get<{ Params: { id: string }; Querystring: { format?: string } }>(
  "/conversations/:id/export",
  async (req, reply) => {
    const userId = (req as any).user?.sub as string;
    const convoId = req.params.id;
    const format = (req.query?.format ?? "markdown").toLowerCase();

    // Verify ownership
    const { data: convo, error: convoErr } = await admin
      .from("conversations")
      .select("id,user_id")
      .eq("id", convoId)
      .single();

    if (convoErr || !convo || convo.user_id !== userId) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    try {
      let content: string;
      let mimeType: string;
      let filename: string;

      switch (format) {
        case "json":
          content = await exportJSON(convoId);
          mimeType = "application/json";
          filename = `conversation-${convoId}.json`;
          break;
        case "text":
        case "txt":
          content = await exportText(convoId);
          mimeType = "text/plain";
          filename = `conversation-${convoId}.txt`;
          break;
        case "html":
          content = await exportHTML(convoId);
          mimeType = "text/html";
          filename = `conversation-${convoId}.html`;
          break;
        case "markdown":
        case "md":
        default:
          content = await exportMarkdown(convoId);
          mimeType = "text/markdown";
          filename = `conversation-${convoId}.md`;
          break;
      }

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(content);
    } catch (e: any) {
      return reply.code(500).send({ error: e?.message ?? "Export failed" });
    }
  }
);

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

/* ---------------- Image Analysis ---------------- */
fastify.post("/analyze/image", async (req, reply) => {
  const userId = (req as any).user?.sub as string;

  try {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: "No image file provided" });
    }

    // Get buffer from stream
    const buffer = await data.toBuffer();
    const mimeType = data.mimetype;

    // Validate image type
    if (!mimeType.startsWith("image/")) {
      return reply.code(400).send({ error: "File must be an image" });
    }

    // Get prompt from fields
    const fields: any = data.fields;
    const prompt = fields?.prompt?.value ?? "Describe this image in detail.";

    // Convert to data URI
    const dataUri = bufferToDataUri(buffer, mimeType);

    // Analyze image
    const result = await analyzeImage(dataUri, prompt);

    if (!result.success) {
      return reply.code(500).send({ error: result.error ?? "Image analysis failed" });
    }

    return { analysis: result.text };
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message ?? "Image upload failed" });
  }
});

/* ---------------- File Upload & RAG Ingest ---------------- */
fastify.post("/upload/file", async (req, reply) => {
  const userId = (req as any).user?.sub as string;

  try {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: "No file provided" });
    }

    const buffer = await data.toBuffer();
    const filename = data.filename;
    const mimeType = data.mimetype;

    // Process file to extract text
    const { text, processedAs } = await processFile(buffer, filename, mimeType);

    if (!text || text.trim().length < 10) {
      return reply.code(400).send({ error: "File contains no readable text" });
    }

    // Ingest into RAG
    const result = await ingestTextDocument(userId, text, filename);

    return {
      ...result,
      processedAs,
      textLength: text.length,
    };
  } catch (e: any) {
    return reply.code(500).send({ error: e?.message ?? "File processing failed" });
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
    let customSystemPrompt: string | null = null;

    if (!convId) {
      const { data: newConv, error: convErr } = await admin
        .from("conversations")
        .insert({ user_id: userId, title: q.slice(0, 60) })
        .select()
        .single();
      if (convErr || !newConv) return reply.code(500).send({ error: convErr?.message ?? "conv create failed" });
      convId = newConv.id;
      customSystemPrompt = newConv.system_prompt;
    } else {
      const { data: c, error: ce } = await admin.from("conversations").select("id,user_id,system_prompt").eq("id", convId).single();
      if (ce || !c || c.user_id !== userId) return reply.code(404).send({ error: "Conversation not found" });
      customSystemPrompt = c.system_prompt;
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

    // Retrieve relevant context from user's documents (RAG)
    let ragContext = "";
    try {
      const chunks = await retrieveContext(userId, q, { topK: 3, useKeywordFallback: true });
      if (chunks.length > 0) {
        ragContext = "\n\nRelevant context from your documents:\n" +
          chunks.map((c, i) => `[${i + 1}] From "${c.filename}":\n${c.content}`).join("\n\n");
      }
    } catch (e: any) {
      console.warn("[chat] RAG retrieval failed:", e?.message ?? e);
    }

    // Use enhanced system prompt
    const baseSystem = customSystemPrompt
      ? enhanceCustomPrompt(customSystemPrompt)
      : getSystemPrompt("default");
    const system = `${baseSystem}${ragContext}`;

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
    let customSystemPrompt: string | null = null;

    if (!convId) {
      const { data: newConv, error: convErr } = await admin
        .from("conversations")
        .insert({ user_id: userId, title: q.slice(0, 60) })
        .select()
        .single();
      if (convErr || !newConv) return reply.code(500).send({ error: convErr?.message ?? "conv create failed" });
      convId = newConv.id;
      customSystemPrompt = newConv.system_prompt;
    } else {
      const { data: c, error: ce } = await admin.from("conversations").select("id,user_id,system_prompt").eq("id", convId).single();
      if (ce || !c || c.user_id !== userId) return reply.code(404).send({ error: "Conversation not found" });
      customSystemPrompt = c.system_prompt;
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

    // Retrieve relevant context from user's documents (RAG)
    let ragContextStream = "";
    try {
      const chunks = await retrieveContext(userId, q, { topK: 3, useKeywordFallback: true });
      if (chunks.length > 0) {
        ragContextStream = "\n\nRelevant context from your documents:\n" +
          chunks.map((c, i) => `[${i + 1}] From "${c.filename}":\n${c.content}`).join("\n\n");
      }
    } catch (e: any) {
      console.warn("[chat/stream] RAG retrieval failed:", e?.message ?? e);
    }

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
      // Use enhanced system prompt
      const baseSystemStream = customSystemPrompt
        ? enhanceCustomPrompt(customSystemPrompt)
        : getSystemPrompt("default");
      const systemStream = `${baseSystemStream}${ragContextStream}`;

      const { provider: p, modelId, stream } = await routeGenerateStreamWithMeta(
        systemStream,
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
