import { admin } from "./db";
import { CFG } from "./config";
import { togetherEmbed } from "./models/together";
import { ollamaEmbed } from "./models/ollama";

/** Simple char-length chunker ~800 tokens (~3200 chars) with small overlap */
export function chunkText(raw: string, targetChars = 3200, overlap = 300): string[] {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + targetChars);
    chunks.push(text.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
    if (i >= text.length) break;
  }
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const nonEmpty = texts.map(t => t || " ");
  // prefer Together for embeddings if API key present; else Ollama
  if (CFG.TOGETHER_API_KEY) {
    return await togetherEmbed(nonEmpty);
  }
  return await ollamaEmbed(nonEmpty);
}

/** Ingest arbitrary text into doc + chunks for a user */
export async function ingestTextDocument(params: {
  userId: string;
  filename: string;
  text: string;
}) {
  const { userId, filename, text } = params;
  const { data: doc, error: de } = await admin
    .from("documents")
    .insert({ user_id: userId, filename, mime_type: "text/plain", byte_size: text.length })
    .select()
    .single();
  if (de || !doc) throw new Error(de?.message ?? "doc insert failed");

  const pieces = chunkText(text);
  const embs = await embedBatch(pieces);

  const rows = pieces.map((content, idx) => ({
    document_id: doc.id,
    user_id: userId,
    chunk_index: idx,
    content,
    embedding: embs[idx] as any, // pgvector will accept float[] via supabase-js
  }));

  const { error: ce } = await admin.from("doc_chunks").insert(rows);
  if (ce) throw new Error(ce.message);
  return { documentId: doc.id, chunks: rows.length };
}

/** Retrieve top-k context for a user + query */
export async function retrieveContext(userId: string, query: string, k = 6): Promise<string> {
  const [qEmb] = await embedBatch([query]);
  // Use pgvector cosine distance on user's rows
  const { data, error } = await admin.rpc("match_doc_chunks", {
    query_embedding: qEmb as any,
    match_count: k,
    user_id_input: userId,
  });

  if (error) {
    // Fallback: no context
    return "";
  }
  const texts: string[] = (data ?? []).map((r: any) => r.content);
  return texts.join("\n---\n");
}
