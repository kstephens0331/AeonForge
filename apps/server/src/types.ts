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

export type ProviderName = "ollama" | "together" | "echo";

export interface RouteResult {
  provider: ProviderName;
  model: string;
  text: string;
  tokens_in?: number;
  tokens_out?: number;
  success: boolean;
  latency_ms: number;
}
