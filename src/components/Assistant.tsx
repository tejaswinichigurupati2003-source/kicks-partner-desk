"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DiffCardView } from "@/components/DiffCardView";
import type { DiffCard } from "@/lib/diffcard";
import { useDesk } from "@/lib/desk";

interface Msg {
  role: "user" | "assistant";
  text: string;
  cards?: DiffCard[];
}

function bold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));
}

export function Lines({ lines }: { lines: string[] }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`l${out.length}`} className="my-1 list-disc space-y-1 pl-5">
          {list.map((l, i) => (
            <li key={i}>{bold(l)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((l) => {
    if (l.startsWith("- ")) list.push(l.slice(2));
    else {
      flush();
      if (l === "") out.push(<div key={`s${out.length}`} className="h-2" />);
      else out.push(<p key={`p${out.length}`}>{bold(l)}</p>);
    }
  });
  flush();
  return <div className="space-y-1 text-[15px]">{out}</div>;
}

const SUGGESTIONS = ["Why is APP-005 approved at 32 while APP-003 at 87 is waitlisted?", "APP-002 has withdrawn", "APP-012 found a 450 sq ft ground-floor rented shop", "Add one opening to TER-03", "Which areas are full?"];
const DOCK = 440;

export function Assistant() {
  const desk = useDesk();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const set = () => setDesktop(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // On desktop the panel sits beside the page, so the page keeps its own space and stays usable.
  useEffect(() => {
    if (!(open && desktop)) return;
    const prev = document.body.style.paddingRight;
    document.body.style.paddingRight = `${DOCK}px`;
    document.body.style.transition = "padding-right 0.15s ease-out";
    return () => {
      document.body.style.paddingRight = prev;
    };
  }, [open, desktop]);

  // Load the conversation for this run when the panel opens.
  useEffect(() => {
    if (!open || !desk.runId || loadedFor === desk.runId) return;
    setLoadedFor(desk.runId);
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; messages?: { role: "user" | "assistant"; text: string; cards?: DiffCard[] }[] }) => {
        if (j.ok && j.messages) setMsgs(j.messages.map((m) => ({ role: m.role, text: m.text, cards: m.cards ?? [] })));
      })
      .catch(() => undefined);
  }, [open, desk.runId, loadedFor]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [open, msgs, busy]);

  const send = async (q: string) => {
    const message = q.trim();
    if (!message || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": encodeURIComponent(desk.actor) }, body: JSON.stringify({ message }) });
      const j = (await res.json()) as { ok: boolean; text?: string; reply?: { text: string; cards: DiffCard[] } };
      if (j.ok && j.reply) {
        const cards = j.reply.cards ?? [];
        setMsgs((m) => [...m, { role: "assistant", text: j.reply!.text, cards }]);
        if (cards.length) await desk.receiveCard(cards[cards.length - 1]);
      } else setMsgs((m) => [...m, { role: "assistant", text: j.text ?? "Something went wrong. Nothing was lost. Please try again." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "We couldn't reach the assistant. Please check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  if (!open)
    return (
      <button className="btn fixed bottom-[72px] right-4 z-40 lg:bottom-6 lg:right-6" aria-label="Open the assistant" aria-expanded={false} onClick={() => setOpen(true)}>
        Ask assistant
      </button>
    );

  return (
    <aside
      role="complementary"
      aria-label="Assistant"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[78vh] flex-col rounded-t-2xl border-t border-soft-line bg-box shadow-[0_-8px_30px_rgba(16,24,40,0.15)] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
      style={desktop ? { width: DOCK } : undefined}
    >
      <div className="flex items-center justify-between border-b border-soft-line bg-white px-4 py-3">
        <div>
          <h2 className="text-[18px] font-bold leading-tight">Assistant</h2>
          <p className="text-xs text-muted">Answers from the stored decisions. Saves what you tell it.</p>
        </div>
        <button className="min-h-[44px] min-w-[44px] text-2xl" aria-label="Close the assistant" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p>Ask why someone got a decision, compare two applicants, or tell me new information. Changes are saved and everyone in the area is re-checked.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="min-h-[44px] rounded-full border border-[#cdd6e6] bg-white px-3 text-left text-sm font-semibold" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-[#e8efff] p-3 font-semibold">
              {m.text}
            </div>
          ) : (
            <div key={i} className="mr-2 space-y-3">
              <div className="card p-3">
                <Lines lines={m.text.split("\n")} />
              </div>
              {(m.cards ?? []).map((c, j) => (
                <DiffCardView key={j} card={c} onApplied={(saved, line) => setMsgs((m) => [...m, { role: "assistant", text: line, cards: [saved] }])} />
              ))}
            </div>
          ),
        )}
        {busy && (
          <p className="text-muted" role="status">
            Looking at the decisions…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-soft-line bg-white p-3">
        <label htmlFor="ask" className="sr-only">
          Your question or new information
        </label>
        <input id="ask" ref={inputRef} className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask, or tell me what changed…" autoComplete="off" maxLength={800} />
        <button className="btn btn-small" type="submit" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
