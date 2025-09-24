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
