"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { answer, type PendingChange, type Reply } from "@/engine/assistant";
import { useDesk } from "@/lib/desk";

interface Msg {
  from: "team" | "assistant";
  text?: string;
  reply?: Reply;
  saved?: boolean;
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

const SUGGESTIONS = ["Which five should we start with?", "Show everyone who needs information", "Which areas are full?"];

export function Assistant() {
  const desk = useDesk();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = (q: string) => {
    if (!q.trim()) return;
    const reply = answer(q, { input: { applications: desk.ws.applications, territories: desk.ws.territories, stores: desk.ws.stores, overrides: desk.ws.overrides }, result: desk.result, now: desk.now }, pending);
    setPending(reply.pending ?? null);
    setMsgs((m) => [...m, { from: "team", text: q }, { from: "assistant", reply }]);
    setText("");
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const save = (index: number) => {
    const m = msgs[index];
    const w = m.reply?.whatIf;
    if (!w || w.missing.length) return;
    const parts = Object.entries(w.change).map(([k, v]) => `${k} ${v}`).join(", ");
    desk.saveChange(w.id, w.change, `New information saved: ${parts}.`);
    setMsgs((all) => all.map((x, i) => (i === index ? { ...x, saved: true } : x)));
    setPending(null);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="btn fixed bottom-[72px] right-4 z-40 lg:bottom-6 lg:right-6" aria-label="Ask the assistant">
          Ask assistant
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[460px] flex-col border-l-2 border-ink bg-box shadow-[-6px_0_0_#111]"
        >
          <div className="flex items-center justify-between border-b-2 border-ink bg-ink px-4 py-3 text-white">
            <Dialog.Title className="font-display-up text-[26px] leading-none">Ask assistant</Dialog.Title>
            <Dialog.Close className="min-h-[44px] min-w-[44px] text-2xl text-white" aria-label="Close">
              ×
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p>Ask why someone got a decision, who is ahead of them, or what happens if something changes.</p>
                <p className="text-muted">For example: “Why is APP-007 on the waiting list?” or “APP-012 found a ground-floor shop.”</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="btn btn-ghost btn-small" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.from === "team" ? (
                <div key={i} className="ml-8 rounded-md border-2 border-ink bg-lime p-3 font-semibold">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="card mr-4 p-3">
                  <Lines lines={m.reply!.lines} />
                  {m.reply!.whatIf && m.reply!.whatIf.rows.length > 0 && (
                    <div className="mt-3 border-t-2 border-soft-line pt-3">
                      <button className="btn btn-small" disabled={m.saved || m.reply!.whatIf.missing.length > 0} onClick={() => save(i)}>
                        {m.saved ? "Saved" : "Save this change"}
                      </button>
                      {m.reply!.whatIf.missing.length > 0 && <p className="mt-2 text-sm text-muted">Add the missing detail first.</p>}
                    </div>
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t-2 border-ink bg-surface p-3">
            <label htmlFor="ask" className="sr-only">
              Your question
            </label>
            <input id="ask" className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about an applicant…" autoComplete="off" />
            <button className="btn btn-small" type="submit">
              Ask
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
