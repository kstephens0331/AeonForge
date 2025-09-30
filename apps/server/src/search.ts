// apps/server/src/search.ts
// Search across conversations and messages

import { admin } from "./db.js";
import { togetherEmbed } from "./models/together.js";

/**
 * Search conversations by title (keyword search)
 */
export async function searchConversations(
  userId: string,
  query: string,
  limit: number = 20
): Promise<Array<{ id: string; title: string; created_at: string; relevance: number }>> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    const { data, error } = await admin
      .from("conversations")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .ilike("title", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[search] Conversation search failed:", error.message);
      return [];
    }

    return (data ?? []).map(row => ({
      ...row,
      relevance: 1.0, // Simple match, assign max relevance
    }));
  } catch (e: any) {
    console.warn("[search] searchConversations failed:", e?.message ?? e);
    return [];
  }
}

/**
 * Search messages by content (keyword search)
 */
export async function searchMessages(
  userId: string,
  query: string,
  limit: number = 50
): Promise<Array<{
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  relevance: number;
}>> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Get user's conversations first
    const { data: convos } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", userId);

    if (!convos || convos.length === 0) return [];

    const convoIds = convos.map(c => c.id);

    // Search messages in those conversations
    const { data, error } = await admin
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", convoIds)
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[search] Message search failed:", error.message);
      return [];
    }

    return (data ?? []).map(row => ({
      ...row,
      relevance: 1.0,
    }));
  } catch (e: any) {
    console.warn("[search] searchMessages failed:", e?.message ?? e);
    return [];
  }
}

/**
 * Semantic search across messages using embeddings
 * Requires message embeddings to be pre-computed and stored
 */
export async function semanticSearchMessages(
  userId: string,
  query: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  similarity: number;
}>> {
  try {
    // Embed the query
    const [queryEmbedding] = await togetherEmbed([query]);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to embed query");
    }

    // Get user's conversations first
    const { data: convos } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", userId);

    if (!convos || convos.length === 0) return [];

    const convoIds = convos.map(c => c.id);

    // Use Supabase RPC for vector similarity search
    // Note: Requires message_embeddings table and pgvector function
    const { data, error } = await admin.rpc("match_messages", {
      query_embedding: queryEmbedding,
      match_conversation_ids: convoIds,
      match_count: limit,
      similarity_threshold: 0.5,
    });

    if (error) {
      console.warn("[search] Semantic search failed:", error.message);
      // Fallback to keyword search
      const results = await searchMessages(userId, query, limit);
      return results.map(r => ({ ...r, similarity: r.relevance }));
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
      similarity: row.similarity,
    }));
  } catch (e: any) {
    console.warn("[search] semanticSearchMessages failed:", e?.message ?? e);
    // Fallback to keyword search
    const results = await searchMessages(userId, query, limit);
    return results.map(r => ({ ...r, similarity: r.relevance }));
  }
}

/**
 * Unified search: search conversations and messages
 */
export async function unifiedSearch(
  userId: string,
  query: string
): Promise<{
  conversations: Array<{ id: string; title: string; created_at: string; relevance: number }>;
  messages: Array<{
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
    similarity: number;
  }>;
}> {
  const [conversations, messages] = await Promise.all([
    searchConversations(userId, query, 10),
    semanticSearchMessages(userId, query, 20),
  ]);

  return { conversations, messages };
}