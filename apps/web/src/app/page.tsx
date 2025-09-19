"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/api";
import StatusPill from "../components/StatusPill";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string; created_at?: string; id?: string };
type Conversation = { id: string; title: string | null; created_at: string };

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // session watcher
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
      setToken(s?.access_token ?? null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // hydrate conversationId from localStorage
  useEffect(() => {
    const cid = localStorage.getItem("af_conversation_id");
    if (cid) setConversationId(cid);
  }, []);

  // when we have token + conversationId, load messages. If no conversationId, create one.
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        let cid = conversationId;
        if (!cid) {
          // Make a new conversation with a simple title
          const res = await apiFetch<{ conversation: Conversation }>(
            "/conversations",
            token,
            { method: "POST", body: JSON.stringify({ title: "New chat" }) }
          );
          cid = res.conversation.id;
          setConversationId(cid);
          localStorage.setItem("af_conversation_id", cid);
        }

        // Load existing messages
        const list = await apiFetch<{ messages: ChatMessage[] }>(
          `/conversations/${cid}/messages`,
          token
        );
        setMessages(list.messages);
        // scroll down
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }, 0);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // textarea autosize up to 6 lines
  const autoSize = () => {
    const el = textareaRef.current;
    if (!el) return;
    const lineHeightPx = 24, maxLines = 6;
    const max = lineHeightPx * maxLines;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  };
  useEffect(() => { autoSize(); }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !token) return;

    setLoading(true);
    try {
      const res = await apiFetch<{ conversationId: string; text: string }>(
        "/chat",
        token,
        { method: "POST", body: JSON.stringify({ conversationId, text }) }
      );

      // persist cid in case it was created server-side
      if (!conversationId) {
        setConversationId(res.conversationId);
        localStorage.setItem("af_conversation_id", res.conversationId);
      }

      // Optimistic UI: add user msg + server echo (assistant)
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: res.text }
      ]);
      setInput("");
      requestAnimationFrame(() => autoSize());

      // Scroll down
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 30);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (!email) {
    return (
      <main className="h-screen w-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">AeonForge</h1>
          <p className="text-slate-300">Please sign in to continue.</p>
          <a
            href="/(auth)/login"
            className="inline-block rounded-xl bg-sky-300 text-slate-900 px-4 py-2 hover:bg-sky-200 transition"
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="h-screen w-screen">
      <StatusPill />
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
            <button
              onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem("af_conversation_id"); }}
              className="text-xs text-slate-300/80 hover:text-white"
            >
              Sign out
            </button>
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
              {loading && (
                <div className="mr-auto max-w-[70%] px-4 py-3 rounded-2xl text-slate-100 border border-white/10 bg-white/8 shadow-[0_10px_30px_rgba(2,6,23,.25)]">
                  <div className="mb-1 text-[11px] text-sky-300">AeonForge</div>
                  Thinking…
                </div>
              )}
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
