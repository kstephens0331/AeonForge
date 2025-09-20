import { admin } from "./db";
import { CFG } from "./config";
import { togetherEmbed } from "./models/together";

/**
 * If a Together key exists and embeddings are present, we do pgvector search via RPC.
 * Otherwise, we fall back to keyword ILIKE on recent chunks.
 */
export async function retrieveContext(userId: string, query: string): Promise<string> {
  const canVector = Boolean(process.env.TOGETHER_API_KEY);

  if (canVector) {
    try {
      const [qVec] = await togetherEmbed([query]); // number[]
      // Call RPC that orders by vector distance; see SQL below.
      const { data: rows, error } = await admin.rpc("match_chunks_for_user", {
        p_user_id: userId,
        p_query: qVec as any,
        p_limit: CFG.RAG_TOP_K,
      });

      if (!error && rows && rows.length) {
        const joined = rows.map((r: any) => r.content).join("\n---\n");
        if (joined && joined.length >= CFG.RAG_MIN_CHARS) {
          return joined.slice(0, 4000);
        }
      }
    } catch {
      // fall through to keyword
    }
  }

  // Keyword fallback
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 6);
  let data: any[] | null = null;

  if (terms.length) {
    const like = terms.map((t) => `%${t}%`);
    const { data: matched } = await admin
      .from("doc_chunks")
      .select("content, created_at")
      .eq("user_id", userId)
      .or(like.map((_l, i) => `content.ilike.${like[i]}`).join(","))
      .order("created_at", { ascending: false })
      .limit(CFG.RAG_TOP_K);
    data = matched ?? null;
  }

  if (!data || data.length === 0) {
    const { data: newest } = await admin
      .from("doc_chunks")
      .select("content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(CFG.RAG_TOP_K);
    data = newest ?? [];
  }

  const joined = data.map((r) => r.content).filter(Boolean).join("\n---\n");
  if (!joined || joined.length < CFG.RAG_MIN_CHARS) return "";
  return joined.slice(0, 4000);
}
