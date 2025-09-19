"use client";

import { useEffect, useRef, useState } from "react";
import StatusPill from "../components/StatusPill";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequest = { messages: ChatMessage[] };
type ChatResponse = { text: string };

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Welcome to AeonForge. Ask me anything." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll messages pane
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-size the textarea up to 4 lines, then allow scroll
  const autoSize = () => {
    const el = textareaRef.current;
    if (!el) return;
    const lineHeightPx = 24;           // Tailwind approx for leading-6
    const maxLines = 6;
    const max = lineHeightPx * maxLines;

    el.style.height = "auto";          // reset
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  };

  useEffect(() => { autoSize(); }, []); // initialize height

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    // reset height after clearing
    requestAnimationFrame(() => autoSize());

    setLoading(true);
    try {
      const body: ChatRequest = { messages: nextMessages };
      const res = await fetch("http://localhost:8787/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as ChatResponse;
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error contacting server." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="h-screen w-screen">
      <StatusPill />
      <div className="h-full w-full px-4 md:px-6 lg:px-10 py-6">
        {/* Glass shell */}
        <div className="mx-auto h-full max-w-6xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_120px_rgba(0,0,0,.35)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 sm:px-8 py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-400 to-teal-300 shadow-[0_6px_20px_rgba(56,189,248,.35)]" />
              <div>
                <h1 className="text-sm sm:text-base font-semibold text-white">AeonForge</h1>
                <p className="text-[11px] sm:text-xs text-slate-300/80">Always returns an answer</p>
              </div>
            </div>
            <div className="hidden sm:block text-xs text-slate-300/80">MVP • Local-first</div>
          </div>

          {/* Chat area */}
          <div className="flex h-[calc(100%-3.5rem)] flex-col">
            {/* Messages */}
            <div
              ref={scrollRef}
              className="chat-scroll flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4"
            >
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={i}
                    className={`max-w-[86%] md:max-w-[70%] px-4 py-3 rounded-2xl leading-relaxed ${
                      isUser
                        ? "ml-auto text-white shadow-[0_10px_30px_rgba(2,6,23,.35)] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800"
                        : "mr-auto text-slate-100 shadow-[0_10px_30px_rgba(2,6,23,.25)] border border-white/10 bg-white/8"
                    }`}
                  >
                    <div
                      className={`mb-1 text-[11px] tracking-wide ${
                        isUser ? "text-slate-300" : "text-sky-300"
                      }`}
                    >
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

            {/* Composer (right-aligned) */}
            <div className="border-t border-white/10 bg-white/5 px-4 sm:px-6 lg:px-8 py-4">
              <div className="ml-auto flex w-full sm:w-[80%] md:w-[70%] lg:w-[60%] gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoSize();
                  }}
                  onKeyDown={onKeyDown}
                  rows={1}
                  className="flex-1 rounded-2xl px-4 py-2.5 bg-white/10 text-slate-100 placeholder:text-slate-400/70 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40 focus:border-white/20 resize-none leading-6 overflow-hidden"
                  placeholder="Type a message (Shift+Enter for newline)…"
                  aria-label="Message input"
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
