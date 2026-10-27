"use client";

import { useState, type FormEvent } from "react";

const MAX = 600;

/** The applicant's way back to the team: answer the question on their own page. */
export function ReplyForm({ token, question, sent }: { token: string; question: string; sent: { at: string; body: string }[] }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [mine, setMine] = useState(sent);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/s/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, text }) });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (j.ok) {
        setMine((m) => [{ at: new Date().toISOString(), body: text.trim() }, ...m]);
        setText("");
        setState("done");
      } else {
        setError(j.error ?? "We couldn't send your answer. Please try again.");
        setState("error");
      }
    } catch {
      setError("We couldn't reach Kicks. Please check your connection and try again.");
      setState("error");
    }
  }

  return (
    <section className="mt-8" aria-labelledby="reply-title">
      <h2 id="reply-title" className="font-display-up text-[18px] leading-tight">
        Your answer
      </h2>
      <p className="mt-2 text-sm text-muted">{question}</p>
      <form onSubmit={submit} className="mt-3">
        <label htmlFor="reply-text" className="sr-only">
          Your answer to our team
        </label>
        <textarea id="reply-text" className="field min-h-[110px]" maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer here, in any language" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className="btn" type="submit" disabled={state === "busy" || text.trim().length < 2}>
            {state === "busy" ? "Sending…" : "Send to Kicks"}
          </button>
          <span className="text-xs text-muted">
            {text.length} / {MAX}
          </span>
        </div>
        {state === "done" && (
          <p role="status" className="mt-3 rounded-xl border border-[#b7e4c7] bg-[#f0fbf4] p-3 text-sm">
            Thank you. Our team has your answer and will update your application. This page changes once they have.
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="mt-3 rounded-xl border border-[#f4c7c3] bg-[#fff5f4] p-3 text-sm font-semibold text-danger">
            ! {error}
          </p>
        )}
      </form>
      {mine.length > 0 && (
        <ul className="mt-4 space-y-2">
          {mine.slice(0, 3).map((m, i) => (
            <li key={i} className="card p-3 text-sm">
              <span className="block text-xs text-muted">You wrote on {new Date(m.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ overflowWrap: "anywhere" }}>{m.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
