// apps/server/src/types.ts

export type Role = "system" | "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type RouteHints = {
  /** Inform routing (e.g., code-heavy prompts) */
  mode?: "coding" | "general";
  /** Ask router to target ~word count and pick a longer-context model */
  targetWords?: number;
  /** Force multilingual-friendly routing */
  multilingual?: boolean;
};

export type RouteResult = {
  success: boolean;
  text: string;
  tokens_in?: number;
  tokens_out?: number;
  provider: "together" | "echo";
  /** Internal model id used for costing; never show to end user */
  model?: string;
};

export type TogetherOptions = {
  maxTokens?: number;
  temperature?: number;
  top_p?: number;
};

export type ModelAlias =
  | "general"
  | "longform"
  | "thinking"
  | "coder"
  | "multilingual";

export type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  system_prompt: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: string;
};
