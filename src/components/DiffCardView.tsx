"use client";

import { useState } from "react";
import { changedCount, type CardLine, type DiffCard } from "@/lib/diffcard";
import { useDesk } from "@/lib/desk";

function Row({ label, before, after }: { label: string; before: string | number | null; after: string | number | null }) {
  const changed = String(before ?? "—") !== String(after ?? "—");
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd>
        {changed ? (
          <>
            <span className="text-muted line-through">{before ?? "—"}</span> <span aria-hidden="true">→</span> <strong>{after ?? "—"}</strong>
          </>
        ) : (
          <span>{after ?? "—"}</span>
        )}
      </dd>
    </div>
  );
}

function Line({ l, strong = false }: { l: CardLine; strong?: boolean }) {
  const cond = l.conditionsAfter.join(" ") || "None";
  const condBefore = l.conditionsBefore.join(" ") || "None";
  return (
    <div className={`rounded-xl border p-3 ${strong ? "border-cobalt bg-[#f3f6ff]" : "border-soft-line bg-white"}`}>
      <p className="font-bold">
        <span className="mono">{l.id}</span> {l.name || "Name not provided"}
      </p>
      <dl className="mt-1 space-y-0.5">
        <Row label="Status" before={l.was} after={l.now} />
        <Row label="Score" before={l.beforeScore} after={l.afterScore} />
        <Row label="Pin" before={l.beforePin} after={l.afterPin} />
        {(l.rankBefore !== l.rankAfter || strong) && <Row label="Rank" before={l.rankBefore} after={l.rankAfter} />}
        <Row label="Conditions" before={condBefore.length > 70 ? `${condBefore.slice(0, 70)}…` : condBefore} after={cond.length > 70 ? `${cond.slice(0, 70)}…` : cond} />
      </dl>
      {l.why && <p className="mt-1 text-xs text-muted">{l.why}</p>}
    </div>
  );
}

/** Shows what a saved change did: the target, everyone else it moved, and an Undo button. */
export function DiffCardView({ card, onClose }: { card: DiffCard; onClose?: () => void }) {
  const desk = useDesk();
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(card.undone ? "done" : "idle");
  const [applying, setApplying] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [applyError, setApplyError] = useState("");
  const moved = changedCount(card);

  async function apply() {
    if (!card.action) return;
    setApplying("busy");
    setApplyError("");
    try {
      const res = await fetch("/api/run/apply", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": encodeURIComponent(desk.actor) }, body: JSON.stringify(card.action) });
      const j = (await res.json()) as { ok: boolean; card?: DiffCard; text?: string };
      if (j.ok && j.card) {
        setApplying("done");
        await desk.receiveCard(j.card);
      } else {
        setApplying("failed");
        setApplyError(j.text ?? "Nothing was saved.");
      }
    } catch {
      setApplying("failed");
      setApplyError("Nothing was saved. Please try again.");
    }
  }

  async function undo() {
    if (!card.groupId) return;
    setState("busy");
    try {
      const res = await fetch("/api/run/undo", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": encodeURIComponent(desk.actor) }, body: JSON.stringify({ groupId: card.groupId }) });
      const j = (await res.json()) as { ok: boolean };
      if (j.ok) {
        await desk.refresh();
        setState("done");
      } else setState("failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="card p-4" aria-label="What changed">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{card.preview ? "Preview, not saved" : "Saved"}</p>
          <p className="font-bold">{card.summary}</p>
        </div>
        {onClose && (
          <button className="min-h-[44px] min-w-[44px] text-xl" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {card.target && (
        <div className="mt-3">
          <Line l={card.target} strong />
        </div>
      )}
      {moved === 0 && <p className="mt-3 text-sm text-muted">No applicant&apos;s decision changed.</p>}
      {card.knockOn.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 font-bold">{card.target ? `Knock-on effects (${card.knockOn.length})` : `Decisions that ${card.preview ? "would change" : "changed"} (${card.knockOn.length})`}</p>
          <ul className="space-y-2">
            {card.knockOn.map((l) => (
              <li key={l.id}>
                <Line l={l} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {card.preview && card.action && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-small" disabled={applying === "busy" || applying === "done"} onClick={apply}>
            {applying === "done" ? "Applied" : applying === "busy" ? "Applying…" : "Apply this change"}
          </button>
          <span className="text-sm text-muted">{applying === "done" ? "Saved. The new card shows what changed, with Undo." : "Nothing has been saved yet."}</span>
          {applying === "failed" && <span className="text-sm font-semibold text-danger">! {applyError}</span>}
        </div>
      )}
      {card.undoable && card.groupId && (
        <div className="mt-3 flex items-center gap-3">
          <button className="btn btn-ghost btn-small" disabled={state === "busy" || state === "done"} onClick={undo}>
            {state === "done" ? "Undone" : state === "busy" ? "Undoing…" : "Undo"}
          </button>
          {state === "failed" && <span className="text-sm font-semibold text-danger">! This can't be undone any more.</span>}
        </div>
      )}
    </section>
  );
}
