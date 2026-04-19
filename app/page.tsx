"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatRelativeTime } from "@/lib/utils";

type HealthStatus = "checking" | "ok" | "error";

const SUGGESTED_PROMPTS = [
  "What's Logan's testing stack?",
  "Tell me about Logan's resume.",
  "What makes Logan a strong QA lead?",
  "Tell me about his side projects",
];

export default function Home() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
    setMessages,
    append,
    reload,
  } = useChat({ api: "/api/chat" });

  const inputRef = useRef<HTMLInputElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const prevIsLoadingRef = useRef(false);
  // Track message creation times without triggering re-renders on every message
  const msgTimesRef = useRef<Map<string, Date>>(new Map());
  const [timeTick, setTimeTick] = useState(0);

  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Stamp each new message with a creation time
  useEffect(() => {
    let changed = false;
    for (const m of messages) {
      if (!msgTimesRef.current.has(m.id)) {
        msgTimesRef.current.set(m.id, new Date());
        changed = true;
      }
    }
    if (changed) setTimeTick((n) => n + 1);
  }, [messages]);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => setHealthStatus(res.ok ? "ok" : "error"))
      .catch(() => setHealthStatus("error"));
  }, []);

  // Scroll thinking indicator into view when a new submission starts
  useEffect(() => {
    if (isLoading && !prevIsLoadingRef.current) {
      requestAnimationFrame(() => {
        thinkingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);


  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      append({ role: "user", content: prompt });
    },
    [append]
  );

  return (
    <div className="flex flex-col h-dvh max-w-2xl mx-auto px-4">

      {/* ── Header ── */}
      <div className="py-3 sm:py-6 border-b border-white/[0.07] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="title-glow text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-transparent">
            LoganGPT
          </h1>
          <p className="text-sm text-white/30 mt-1.5 tracking-wide">
            Ask anything about Logan
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">

          {/* API health indicator */}
          <div className="group/tip relative flex items-center justify-center w-9 h-9">
            <span
              className={`block w-2.5 h-2.5 rounded-full ${
                healthStatus === "ok"
                  ? "bg-emerald-400"
                  : healthStatus === "error"
                  ? "bg-red-400"
                  : "bg-yellow-400 status-pulse"
              }`}
            />
            <span className="tooltip">
              {healthStatus === "ok"
                ? "API is responsive"
                : healthStatus === "error"
                ? "API failed health check"
                : "Verifying connection…"}
            </span>
          </div>

          {/* Clear chat — only visible when there are messages */}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              aria-label="Clear chat history"
              className="group/tip relative flex items-center justify-center w-11 h-11 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
              <span className="tooltip">Clear chat</span>
            </button>
          )}

          {/* Resume button */}
          <a
            href="https://drive.google.com/file/d/1nn7QwJJEb9OIMxMZzmINtiJTBbUBWgeV/view?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Logan's resume (opens in new tab)"
            className="group/tip relative flex items-center justify-center w-11 h-11 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <span className="tooltip">Resume</span>
          </a>

          {/* Portfolio button */}
          <a
            href="https://loganctallman.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Logan's portfolio (opens in new tab)"
            className="group/tip relative flex items-center justify-center w-11 h-11 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span className="tooltip">Portfolio</span>
          </a>
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto py-6 space-y-5"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* Empty state with suggested prompts */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 mt-6 sm:mt-12 select-none">
            <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center text-2xl shadow-lg">
              💬
            </div>
            <p className="text-white/25 text-sm tracking-wide">
              Ask about Logan&apos;s background, skills, or experience
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-1 max-w-sm px-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="prompt-chip"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="group/msg relative max-w-[85%]">
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed text-white/90 ${
                  m.role === "user"
                    ? "bubble-user whitespace-pre-wrap"
                    : "bubble-assistant prose-chat"
                }`}
              >
                {m.role === "user" ? (
                  m.content
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                )}
              </div>

              {/* Timestamp + copy button — visible on hover */}
              <div
                className={`flex items-center gap-1.5 mt-1 px-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <span className="text-white/20 text-xs" suppressHydrationWarning>
                  {/* timeTick forces re-render so relative times stay fresh */}
                  {timeTick >= 0 && formatRelativeTime(msgTimesRef.current.get(m.id) ?? new Date())}
                </span>
                {m.role === "assistant" && (
                  <button
                    onClick={() => handleCopy(m.id, m.content)}
                    aria-label={copiedId === m.id ? "Copied!" : "Copy message"}
                    className="copy-btn"
                  >
                    {copiedId === m.id ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div ref={thinkingRef} className="flex justify-start message-in">
            <div className="bubble-assistant rounded-2xl px-5 py-4">
              <span className="inline-flex gap-2 items-center">
                <span className="inline-flex gap-1.5">
                  <span className="dot w-1.5 h-1.5 bg-violet-300/70 rounded-full" />
                  <span className="dot w-1.5 h-1.5 bg-violet-300/70 rounded-full" />
                  <span className="dot w-1.5 h-1.5 bg-violet-300/70 rounded-full" />
                </span>
                <span className="text-white/30 text-xs">Logan is thinking…</span>
              </span>
            </div>
          </div>
        )}

        {/* Error state with retry */}
        {error && (
          <div className="message-in flex justify-start">
            <div className="glass rounded-2xl px-4 py-3 border border-red-500/20 bg-red-500/5 max-w-[85%]">
              <p className="text-red-300/80 text-xs">
                Something went wrong.{" "}
                <button
                  onClick={() => reload()}
                  className="underline hover:text-red-200/80 transition-colors"
                >
                  Retry
                </button>
              </p>
            </div>
          </div>
        )}

      </div>

      {/* ── Input bar ── */}
      <div className="py-3 sm:py-5 border-t border-white/[0.07]">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about Logan..."
              disabled={isLoading}
              maxLength={500}
              aria-label="Message input"
              className="glass-input w-full rounded-2xl px-5 py-3.5 pr-12 text-sm text-white/90 placeholder:text-white/25 disabled:opacity-40"
            />

            {/* Enter hint — shown when input is empty */}
            {!isLoading && input.length === 0 && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/15 text-xs pointer-events-none select-none">
                ↵
              </span>
            )}

            {/* Character counter — shown near the limit */}
            {input.length > 400 && (
              <span
                className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs pointer-events-none select-none ${
                  input.length > 480 ? "text-red-400/70" : "text-white/25"
                }`}
              >
                {500 - input.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop response"
              className="btn-stop rounded-2xl px-6 py-3.5 text-sm font-semibold text-white tracking-wide"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="btn-send rounded-2xl px-6 py-3.5 text-sm font-semibold text-white tracking-wide"
            >
              Send
            </button>
          )}
        </form>
      </div>

    </div>
  );
}
