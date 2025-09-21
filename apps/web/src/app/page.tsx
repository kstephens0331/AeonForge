"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/api";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string; created_at?: string; id?: string };
type Conversation = { id: string; title: string | null; created_at: string };

function StatusPillInline() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch("/api/healthz", { cache: "no-store" });
        if (!cancelled) setStatus(res.ok ? "online" : "offline");
      } catch { if (!cancelled) setStatus("offline"); }
    }
    ping();
    const id = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const color = status === "online" ? "bg-emerald-400" : status === "offline" ? "bg-rose-400" : "bg-slate-400";
  const label = status === "online" ? "API online" : status === "offline" ? "API offline" : "Checking…";
  return (
    <div className="fixed left-3 bottom-3 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-100 backdrop-blur-xl">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aborter, setAborter] = useState<AbortController | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
      setToken(s?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const cid = localStorage.getItem("af_conversation_id");
    if (cid) setConversationId(cid);
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        let cid = conversationId;
        if (!cid) {
          const res = await apiFetch<{ conversation: Conversation }>(
            "/conversations",
            token,
            { method: "POST", body: JSON.stringify({ title: "New chat" }) }
          );
          cid = res.conversation.id;
          setConversationId(cid);
          localStorage.setItem("af_conversation_id", cid);
        }
        const list = await apiFetch<{ messages: ChatMessage[] }>(`/conversations/${cid}/messages`, token);
        setMessages(list.messages);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0);
      } catch (e) { console.error(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const autoSize = () => {
    const el = textareaRef.current; if (!el) return;
    const line = 24, max = line * 6;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  };
  useEffect(() => { autoSize(); }, []);

  function appendAssistant(text: string) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") last.content += text;
      return copy;
    });
  }

  async function fallbackNonStreaming(q: string) {
    // call /chat (non-streaming) if stream didn’t produce chunks
    if (!token) return;
    try {
      const r = await apiFetch<{ conversationId: string; text: string }>(
        "/chat",
        token,
        { method: "POST", body: JSON.stringify({ conversationId, text: q }) }
      );
      if (!conversationId && r.conversationId) {
        setConversationId(r.conversationId);
        localStorage.setItem("af_conversation_id", r.conversationId);
      }
      appendAssistant(r.text || "(no response)");
    } catch (e) {
      console.error(e);
      appendAssistant("…request failed.");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !token || loading) return;

    // optimistic UI
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    requestAnimationFrame(() => autoSize());
    setLoading(true);

    const controller = new AbortController();
    setAborter(controller);

    let gotFirstChunk = false;
    const firstChunkTimer = setTimeout(() => {
      if (!gotFirstChunk && !controller.signal.aborted) {
        controller.abort(); // stop the stuck stream
      }
    }, 4000); // fallback if no chunk in 4s

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId, text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          gotFirstChunk = true;
          const chunk = decoder.decode(value, { stream: true });

          // Support both plain-text chunks and SSE ("data: ...\n\n")
          if (chunk.includes("data:")) {
            for (const block of chunk.split("\n\n")) {
              const lines = block.split("\n");
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  appendAssistant(line.slice(5).trimStart());
                }
              }
            }
          } else {
            appendAssistant(chunk);
          }

          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }
      }
    } catch (err: unknown) {
      const aborted =
        (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (!aborted) console.error(err);
    } finally {
      clearTimeout(firstChunkTimer);
      setLoading(false);
      setAborter(null);

      // If assistant bubble is still empty, use fallback
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          // call fallback outside setState
          void fallbackNonStreaming(text);
        }
        return prev;
      });

      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 16);
    }
  }

  function stopRequest() {
    if (aborter) { aborter.abort(); setAborter(null); setLoading(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (loading) { e.preventDefault(); return; }
      e.preventDefault();
      void sendMessage();
    }
  }

  if (!email) {
    return (
      <main className="h-screen w-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">AeonForge</h1>
          <p className="text-slate-300">Please sign in to continue.</p>
          <Link href="/login" className="inline-block rounded-xl bg-sky-300 text-slate-900 px-4 py-2 hover:bg-sky-200 transition">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen">
      <StatusPillInline />
      <div className="h-full w-full px-4 md:px-6 lg:px-10 py-6">
        <div className="mx-auto h-full max-w-6xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_120px_rgba(0,0,0,.35)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 sm:px-8 py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-400 to-teal-300 shadow-[0_6px_20px_rgba(56,189,248,.35)]" />
              <div>
                <h1 className="text-sm sm:text-base font-semibold text-white">AeonForge</h1>
                <p className="text-[11px] sm:text-xs text-slate-300/80">{email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loading && (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-100">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-300 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-300"></span>
                    </span>
                    <span>AeonForge is thinking…</span>
                  </div>
                  <button onClick={stopRequest}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/20 transition"
                          aria-label="Stop generating" title="Stop">
                    Stop
                  </button>
                </div>
              )}
              <button onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem("af_conversation_id"); }}
                      className="text-xs text-slate-300/80 hover:text-white">
                Sign out
              </button>
            </div>
          </div>

          <div className="flex h-[calc(100%-3.5rem)] flex-col">
            <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                return (
                  <div key={i}
                       className={`max-w-[86%] md:max-w-[70%] px-4 py-3 rounded-2xl leading-relaxed ${
                         isUser
                           ? "ml-auto text-white shadow-[0_10px_30px_rgba(2,6,23,.35)] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800"
                           : "mr-auto text-slate-100 shadow-[0_10px_30px_rgba(2,6,23,.25)] border border-white/10 bg-white/8"
                       }`}>
                    <div className={`mb-1 text-[11px] ${isUser ? "text-slate-300" : "text-sky-300"}`}>
                      {isUser ? "You" : "AeonForge"}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/10 bg-white/5 px-4 sm:px-6 lg:px-8 py-4">
              <div className="ml-auto flex w-full sm:w-[80%] md:w-[70%] lg:w-[60%] gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoSize(); }}
                  onKeyDown={onKeyDown}
                  rows={1}
                  className="flex-1 rounded-2xl px-4 py-2.5 bg-white/10 text-slate-100 placeholder:text-slate-400/70 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40 focus:border-white/20 resize-none leading-6 overflow-hidden"
                  placeholder="Type a message (Shift+Enter for newline)…"
                />
                <button
                  className="px-4 py-2.5 rounded-2xl text-slate-900 bg-sky-300 hover:bg-sky-200 active:bg-sky-300 transition shadow-[0_10px_30px_rgba(56,189,248,.35)] disabled:opacity-60"
                  disabled={loading || !input.trim()}
                  aria-busy={loading}
                  onClick={() => void sendMessage()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
