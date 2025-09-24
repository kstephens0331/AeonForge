"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Plus } from "lucide-react";

type Role = "user" | "assistant";
type ChatMessage = { role: Role; content: string };

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string | null;
  mode?: "code" | "studying" | "project" | "general";
};

function useAuthToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("af_token") : null;
    setToken(t || "");
  }, []);
  return token;
}

export default function ChatPage() {
  const token = useAuthToken();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [miniStatus, setMiniStatus] = useState("");
  const [aborter, setAborter] = useState<AbortController | null>(null);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [newMode, setNewMode] = useState<Conversation["mode"]>("code");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations into sidebar
  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const list = await apiFetch<{ conversations: Conversation[] }>("/conversations", token);
        setConvos(list.conversations || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [token]);

  // Ensure we have a current conversation and fetch its messages
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        let cid = typeof window !== "undefined" ? localStorage.getItem("af_conversation_id") : null;
        if (!cid) {
          const res = await apiFetch<{ conversation: Conversation }>(
            "/conversations",
            token,
            { method: "POST", body: JSON.stringify({ title: "New chat" }) }
          );
          cid = res.conversation.id;
          localStorage.setItem("af_conversation_id", cid);
        }
        setConversationId(cid!);

        const list = await apiFetch<{ messages: ChatMessage[] }>(`/conversations/${cid}/messages`, token);
        setMessages(list.messages);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [token]);

  // Auto-size input
  const autoSize = () => {
    const el = textareaRef.current; if (!el) return;
    const line = 24, max = line * 6;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  };
  useEffect(() => { autoSize(); }, []);

  function pushAssistantIfNeeded() {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return [...prev, { role: "assistant", content: "" }];
      return prev;
    });
  }

  function appendAssistant(text: string) {
    if (!text) return;
    setMessages((prev) => {
      const copy = [...prev];
      if (!copy.length || copy[copy.length - 1].role !== "assistant") {
        copy.push({ role: "assistant", content: "" });
      }
      copy[copy.length - 1].content += text;
      return copy;
    });
  }

  function detectRequestedWords(s: string): number | null {
    const k = s.match(/(\d+(?:[\.,]\d+)?)\s*k\s*words?/i);
    if (k) {
      const n = Math.round(parseFloat(k[1].replace(",", ".")) * 1000);
      return isFinite(n) ? n : null;
    }
    const m = s.match(/(\d{3,6})\s*words?/i);
    if (m) {
      const n = parseInt(m[1].replace(/[,._]/g, ""), 10);
      return isFinite(n) ? n : null;
    }
    return null;
  }

  async function fallbackNonStreaming(q: string, targetWords?: number | null) {
    if (!token) return;
    try {
      const r = await apiFetch<{ conversationId: string; text: string }>(
        "/chat",
        token,
        { method: "POST", body: JSON.stringify({ conversationId, text: q, targetWords }) }
      );
      if (!conversationId && r.conversationId) {
        setConversationId(r.conversationId);
        localStorage.setItem("af_conversation_id", r.conversationId);
      }
      const cleaned = (r.text || "(no response)").replace(/<think>[\s\S]*?<\/think>/g, "");
      pushAssistantIfNeeded();
      appendAssistant(cleaned);
    } catch (e) {
      console.error(e);
      pushAssistantIfNeeded();
      appendAssistant("…request failed.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !token || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    requestAnimationFrame(() => autoSize());
    setLoading(true);
    setMiniStatus("connecting");

    const controller = new AbortController();
    setAborter(controller);

    const requestedWords = detectRequestedWords(text);
    const targetWords = requestedWords && requestedWords >= 800 ? Math.min(requestedWords, 20000) : undefined;

    let firstDataTimer: ReturnType<typeof setTimeout> | null = null;
    let gotFirstData = false;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId, text, targetWords }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      firstDataTimer = setTimeout(() => {
        if (!gotFirstData && !controller.signal.aborted) controller.abort();
      }, 2000);

      function processSSE(chunkText: string) {
        buffer += chunkText;
        let advanced = false;

        for (;;) {
          const sep = buffer.indexOf("\n\n");
          if (sep === -1) break;
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          let event: string | null = null;
          const datas: string[] = [];

          for (const raw of block.split("\n")) {
            if (!raw) continue;
            if (raw.startsWith(":")) continue;
            if (raw.startsWith("event:")) { event = raw.slice(6).trim(); continue; }
            if (raw.startsWith("data:")) { datas.push(raw.slice(5)); continue; }
          }

          const dataJoined = datas.join("\n");
          if (event === "status") {
            setMiniStatus(dataJoined.trim());
            continue;
          }

          if (dataJoined) {
            if (!gotFirstData) pushAssistantIfNeeded();
            const cleaned = dataJoined.replace(/<think>[\s\S]*?<\/think>/g, "");
            if (cleaned) {
              appendAssistant(cleaned);
              gotFirstData = true;
              advanced = true;
              setMiniStatus("generating");
            }
          }
        }
        return advanced;
      }

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes("data:") || chunk.includes("\n\n") || chunk.startsWith(":") || chunk.startsWith("event:")) {
            const changed = processSSE(chunk);
            if (changed) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
          } else {
            if (!gotFirstData) pushAssistantIfNeeded();
            const cleaned = chunk.replace(/<think>[\s\S]*?<\/think>/g, "");
            appendAssistant(cleaned);
            gotFirstData = true;
            setMiniStatus("generating");
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
          }
        }
      }
    } catch (err) {
      const aborted =
        (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (!aborted) console.error(err);
    } finally {
      if (firstDataTimer) clearTimeout(firstDataTimer);
      setLoading(false);
      setAborter(null);
      setMiniStatus("done");
      setTimeout(() => setMiniStatus(""), 600);
    }
  }

  function stopRequest() {
    if (aborter) {
      aborter.abort();
      setAborter(null);
      setLoading(false);
      setMiniStatus("");
    }
  }

  async function startNewChat() {
    if (!token) return;
    try {
      const res = await apiFetch<{ conversation: Conversation }>(
        "/conversations",
        token,
        { method: "POST", body: JSON.stringify({ title: `${newMode ?? "code"} chat`, mode: newMode ?? "code" }) }
      );
      const cid = res.conversation.id;
      localStorage.setItem("af_conversation_id", cid);
      setConversationId(cid);
      const list = await apiFetch<{ messages: ChatMessage[] }>(`/conversations/${cid}/messages`, token);
      setMessages(list.messages);
      const convosList = await apiFetch<{ conversations: Conversation[] }>("/conversations", token);
      setConvos(convosList.conversations || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function switchConversation(id: string) {
    if (!token) return;
    try {
      localStorage.setItem("af_conversation_id", id);
      setConversationId(id);
      const list = await apiFetch<{ messages: ChatMessage[] }>(`/conversations/${id}/messages`, token);
      setMessages(list.messages);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <main className="h-screen w-screen">
      <div className="grid grid-cols-[18rem_1fr] h-full">
        {/* Sidebar */}
        <aside className="h-full border-r overflow-hidden flex flex-col">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs uppercase text-gray-500">Conversations</span>
            <button
              className="rounded-xl border px-2 py-1 text-sm"
              onClick={startNewChat}
              title="Create new chat"
            >
              <Plus className="inline-block w-4 h-4" />
            </button>
          </div>

          <div className="px-3 py-2">
            <label className="text-xs uppercase text-gray-500 block mb-1">New chat mode</label>
            <select
              className="w-full rounded-xl border px-2 py-1"
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as any)}
            >
              <option value="code">Code</option>
              <option value="studying">Studying</option>
              <option value="project">Project</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => switchConversation(c.id)}
                className={`w-full text-left truncate rounded-xl px-2 py-1 hover:bg-gray-100 ${conversationId === c.id ? "bg-gray-100" : ""}`}
              >
                <div className="text-sm">{c.title || "(untitled)"}</div>
                <div className="text-xs text-gray-500">{c.mode ? `[${c.mode}]` : ""}</div>
              </button>
            ))}
            {convos.length === 0 && (
              <div className="text-xs text-gray-500 px-2 py-2">No conversations yet.</div>
            )}
          </div>
        </aside>

        {/* Chat window */}
        <section className="h-full flex flex-col">
          <div className="border-b px-4 py-2 text-sm text-gray-600">
            {miniStatus ? `Status: ${miniStatus}` : ""}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-3xl ${m.role === "user" ? "ml-auto text-right" : ""}`}>
                <div className={`inline-block rounded-2xl border px-4 py-2 ${m.role === "user" ? "bg-white" : "bg-gray-50"}`}>
                  <div className="text-xs text-gray-500 mb-1">{m.role}</div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t p-3 flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={autoSize}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading) void sendMessage();
                }
              }}
              placeholder="Type your message… (e.g., 'write 1.2k words on …')"
              className="flex-1 rounded-2xl border px-4 py-3 resize-none leading-6"
              rows={1}
            />
            <button
              onClick={loading ? stopRequest : sendMessage}
              className="rounded-2xl border px-4 py-3 min-w-24"
            >
              {loading ? "Stop" : "Send"}
            </button>
          </div>
        </section>
      </div>

      {!token && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">AeonForge</h1>
            <p className="text-slate-600">Please sign in to continue.</p>
            <Link href="/login" className="inline-block rounded-xl bg-sky-300 text-slate-900 px-4 py-2 hover:bg-sky-200 transition">
              Sign in
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
