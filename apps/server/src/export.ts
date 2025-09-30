// apps/server/src/export.ts
// Export conversations in various formats

import { admin } from "./db.js";

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

/**
 * Export conversation as Markdown
 */
export async function exportMarkdown(conversationId: string): Promise<string> {
  const { data: convo } = await admin
    .from("conversations")
    .select("id, title, created_at")
    .eq("id", conversationId)
    .single();

  if (!convo) throw new Error("Conversation not found");

  const { data: messages } = await admin
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const msgs = (messages ?? []) as Message[];

  let md = `# ${convo.title || "Conversation"}\n\n`;
  md += `*Created: ${new Date(convo.created_at).toLocaleString()}*\n\n`;
  md += `---\n\n`;

  for (const msg of msgs) {
    const role = msg.role === "user" ? "**You**" : "**AeonForge**";
    const timestamp = new Date(msg.created_at).toLocaleTimeString();
    md += `${role} *(${timestamp})*\n\n`;
    md += `${msg.content}\n\n`;
    md += `---\n\n`;
  }

  return md;
}

/**
 * Export conversation as JSON
 */
export async function exportJSON(conversationId: string): Promise<string> {
  const { data: convo } = await admin
    .from("conversations")
    .select("id, title, created_at")
    .eq("id", conversationId)
    .single();

  if (!convo) throw new Error("Conversation not found");

  const { data: messages } = await admin
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const exportData = {
    conversation: convo,
    messages: messages ?? [],
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export conversation as plain text
 */
export async function exportText(conversationId: string): Promise<string> {
  const { data: convo } = await admin
    .from("conversations")
    .select("id, title, created_at")
    .eq("id", conversationId)
    .single();

  if (!convo) throw new Error("Conversation not found");

  const { data: messages } = await admin
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const msgs = (messages ?? []) as Message[];

  let text = `${convo.title || "Conversation"}\n`;
  text += `Created: ${new Date(convo.created_at).toLocaleString()}\n\n`;
  text += `${"=".repeat(60)}\n\n`;

  for (const msg of msgs) {
    const role = msg.role === "user" ? "You" : "AeonForge";
    const timestamp = new Date(msg.created_at).toLocaleTimeString();
    text += `[${role}] ${timestamp}\n`;
    text += `${msg.content}\n\n`;
    text += `${"-".repeat(60)}\n\n`;
  }

  return text;
}

/**
 * Export conversation as HTML
 */
export async function exportHTML(conversationId: string): Promise<string> {
  const { data: convo } = await admin
    .from("conversations")
    .select("id, title, created_at")
    .eq("id", conversationId)
    .single();

  if (!convo) throw new Error("Conversation not found");

  const { data: messages } = await admin
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const msgs = (messages ?? []) as Message[];

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(convo.title || "Conversation")}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f9fafb; }
    h1 { color: #111827; margin-bottom: 8px; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
    .message { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .message.user { background: #f0f9ff; border-left: 4px solid #0ea5e9; }
    .message.assistant { background: #f0fdf4; border-left: 4px solid #10b981; }
    .role { font-weight: 600; margin-bottom: 8px; color: #374151; }
    .time { font-size: 12px; color: #9ca3af; margin-left: 8px; }
    .content { color: #1f2937; white-space: pre-wrap; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${escapeHtml(convo.title || "Conversation")}</h1>
  <div class="meta">Created: ${new Date(convo.created_at).toLocaleString()}</div>
`;

  for (const msg of msgs) {
    const role = msg.role === "user" ? "You" : "AeonForge";
    const roleClass = msg.role === "user" ? "user" : "assistant";
    const timestamp = new Date(msg.created_at).toLocaleTimeString();

    html += `  <div class="message ${roleClass}">
    <div class="role">${role}<span class="time">${timestamp}</span></div>
    <div class="content">${escapeHtml(msg.content)}</div>
  </div>\n`;
  }

  html += `</body>
</html>`;

  return html;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}