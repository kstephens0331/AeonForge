// apps/server/src/tools/types.ts

export type ToolParameter = {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>) => Promise<string>;
};

export type ToolCall = {
  toolName: string;
  parameters: Record<string, any>;
};

export type ToolResult = {
  toolName: string;
  result: string;
  error?: string;
};