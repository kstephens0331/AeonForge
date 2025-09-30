// apps/server/src/rag.ts
// Minimal text-ingest + chunk + (optional) embed + persist to Supabase.

import { admin } from "./db.js";
import { togetherEmbed } from "./models/together.js";

/** Simple paragraph/sentence-based chunking */
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

/**
 * Ingest a raw text blob:
 * - creates a 'documents' row
 * - chunks text and (optionally) embeds
 * - inserts rows into 'doc_chunks'
 *
 * NOTE: 'params' is optional (so calls with 3 args compile).
 */
export async function ingestTextDocument(
  userId: string,
  text: string,
  filename?: string,
  params?: { doEmbed?: boolean; embeddingModelId?: string }
) {
  if (!text || text.trim().length < 10) {
    throw new Error("Provide 'text' with at least 10 characters.");
  }

  const fname = filename && filename.trim() ? filename.trim() : `text-${new Date().toISOString()}.txt`;

  // 1) create document
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

  if (docErr || !doc) throw new Error(docErr?.message ?? "Failed to create document");

  // 2) chunk
  const pieces = chunkText(text);
  if (pieces.length === 0) throw new Error("No chunks produced from provided text.");

  // 3) embeddings (optional)
  let embeddings: number[][] | null = null;
  const wantEmbed = params?.doEmbed ?? Boolean(process.env.TOGETHER_API_KEY);
  if (wantEmbed) {
    try {
      embeddings = await togetherEmbed(pieces, { modelId: params?.embeddingModelId });
    } catch (e: any) {
      // Don't fail ingestion if embeddings fail — proceed with null embeddings
      console.warn("[rag] embedding failed:", e?.message ?? e);
      embeddings = null;
    }
  }

  // 4) insert chunks
  const rows = pieces.map((content, idx) => ({
    document_id: doc.id,
    user_id: userId,
    chunk_index: idx,
    content,
    embedding: embeddings ? embeddings[idx] : null,
  }));
  const { error: chErr } = await admin.from("doc_chunks").insert(rows);
  if (chErr) throw new Error(chErr.message);

  return { documentId: doc.id, filename: doc.filename, chunks: pieces.length, embedded: Boolean(embeddings) };
}

/**
 * Retrieve relevant context chunks for a query using semantic search.
 * Returns top-k most relevant chunks from user's documents.
 */
export async function retrieveContext(
  userId: string,
  query: string,
  opts?: { topK?: number; embeddingModelId?: string; useKeywordFallback?: boolean }
): Promise<Array<{ content: string; filename: string; similarity: number }>> {
  const topK = opts?.topK ?? 5;

  try {
    // 1) Embed the query
    const [queryEmbedding] = await togetherEmbed([query], { modelId: opts?.embeddingModelId });

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to embed query");
    }

    // 2) Use Supabase pgvector similarity search
    // Note: Requires pgvector extension and proper indexing in Supabase
    const { data, error } = await admin.rpc("match_doc_chunks", {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: topK,
      similarity_threshold: 0.5, // Adjust based on your needs
    });

    if (error) {
      console.warn("[rag] Semantic search failed:", error.message);
      // Fallback to keyword search if enabled
      if (opts?.useKeywordFallback) {
        return await keywordSearch(userId, query, topK);
      }
      return [];
    }

    return (data ?? []).map((row: any) => ({
      content: row.content,
      filename: row.filename,
      similarity: row.similarity,
    }));
  } catch (e: any) {
    console.warn("[rag] retrieveContext failed:", e?.message ?? e);
    // Fallback to keyword search
    if (opts?.useKeywordFallback) {
      return await keywordSearch(userId, query, topK);
    }
    return [];
  }
}

/**
 * Keyword-based fallback search when embeddings are unavailable.
 */
async function keywordSearch(
  userId: string,
  query: string,
  limit: number
): Promise<Array<{ content: string; filename: string; similarity: number }>> {
  try {
    // Simple full-text search using ILIKE
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2).slice(0, 5);
    if (keywords.length === 0) return [];

    const { data, error } = await admin
      .from("doc_chunks")
      .select(`
        content,
        documents!inner(filename)
      `)
      .eq("user_id", userId)
      .ilike("content", `%${keywords[0]}%`)
      .limit(limit);

    if (error) {
      console.warn("[rag] Keyword search failed:", error.message);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      content: row.content,
      filename: row.documents?.filename ?? "unknown",
      similarity: 0.7, // Mock similarity for keyword matches
    }));
  } catch (e: any) {
    console.warn("[rag] keywordSearch failed:", e?.message ?? e);
    return [];
  }
}
