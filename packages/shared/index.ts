export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
};

export type ChatResponse = {
  text: string;
};
