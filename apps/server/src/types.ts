export type Role = "user" | "assistant" | "system";

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

export type ProviderName = "local" | "together" | "echo";

export type RouteResult = {
  provider: ProviderName;
  /** Internal-only model identifier. For secrecy we never return this to the client */
  model: string;
  text: string;
  success: boolean;
  latency_ms: number;
  /** Optional token usage when the provider supplies it (Together non-stream) */
  tokens_in?: number;
  tokens_out?: number;
};
