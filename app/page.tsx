"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = { n: number; title: string; url: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; mode?: string; model?: string };

const SUGGESTIONS = [
  "What are the most common reasons Exceptional Promise applications get rejected?",
  "What makes a recommendation letter strong?",
  "Do digitally signed letters need an audit trail?",
  "Can open-source work count for the mandatory criterion?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Chat failed.");
      else
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.answer, sources: data.sources, mode: data.mode, model: data.model },
        ]);
    } catch {
      setError("Network error — is the dev server still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>GT corpus — local chat</h1>
      <p className="page-sub">
        Ask the UK Tech Nation Visa Forum corpus (~3,800 threads on Global Talent endorsements,
        evidence, rejections, Stage 2) — answered locally with your own OpenRouter key, citing
        source threads. Community experience, not legal advice.
      </p>

      {messages.length === 0 ? (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip-btn" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-msgs">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? (
              <div className="msg-body md">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {m.content}
                </Markdown>
              </div>
            ) : (
              <div className="msg-body plain">{m.content}</div>
            )}
            {m.sources?.length ? (
              <div className="msg-sources">
                {m.sources.map((s) => (
                  <a key={s.n} href={s.url} target="_blank" rel="noopener noreferrer">
                    [{s.n}] {s.title} ↗
                  </a>
                ))}
              </div>
            ) : null}
            {m.mode ? (
              <div className="msg-mode">
                retrieval: {m.mode}
                {m.mode === "lexical" ? " (set VOYAGE_API_KEY for semantic)" : ""} · model: {m.model}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <div className="msg assistant thinking">Searching the corpus…</div> : null}
        {error ? <p className="err">{error}</p> : null}
        <div ref={endRef} />
      </div>

      <form
        className="chat-inputrow"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about endorsement, evidence, timelines, Stage 2…"
          maxLength={4000}
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
