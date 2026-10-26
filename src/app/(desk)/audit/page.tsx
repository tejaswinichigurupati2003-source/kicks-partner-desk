"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ImportButton, Loading, PageHeader } from "@/components/ui";

interface EventRow {
  id: number;
  group_id: string;
  application_id: string | null;
  trigger: string;
  actor: string;
  summary: string;
  before: unknown;
  after: unknown;
  undone: boolean;
  undoable: boolean;
  at: string;
}

interface Group {
  groupId: string;
  trigger: string;
  actor: string;
  summary: string;
  at: string;
  undone: boolean;
  undoable: boolean;
  header: EventRow | null;
  rows: EventRow[];
}

const TRIGGERS: { value: string; label: string; tone: string }[] = [
  { value: "import", label: "Import", tone: "approved" },
  { value: "chat", label: "Chat update", tone: "redirected" },
  { value: "assumption", label: "Assumption change", tone: "conditional" },
  { value: "override", label: "Manual override", tone: "not_eligible" },
  { value: "undo", label: "Undo", tone: "needs_info" },
  { value: "edit", label: "Edit", tone: "waiting" },
  { value: "territory", label: "Territory change", tone: "waiting" },
  { value: "stage", label: "Stage update", tone: "needs_info" },
];
const triggerInfo = (t: string) => TRIGGERS.find((x) => x.value === t) ?? { value: t, label: t, tone: "needs_info" };

interface Compact {
  status?: Status;
  score?: number | null;
  pin?: string | null;
  position?: number | null;
  rank?: number | null;
  conditions?: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function show(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Lines such as "Status: Waiting list → Approved to proceed". */
function decisionChanges(before: unknown, after: unknown): string[] {
  const b = (isObject(before) ? before : {}) as Compact;
  const a = (isObject(after) ? after : {}) as Compact;
  const out: string[] = [];
  const label = (s?: Status) => (s ? STATUS_LABEL[s] ?? s : "New");
  if (b.status !== a.status) out.push(`Status: ${label(b.status)} → ${label(a.status)}`);
  if ((b.score ?? null) !== (a.score ?? null)) out.push(`Score: ${show(b.score)} → ${show(a.score)}`);
  if ((b.pin ?? null) !== (a.pin ?? null)) out.push(`Pin: ${show(b.pin)} → ${show(a.pin)}`);
  if ((b.position ?? null) !== (a.position ?? null)) out.push(`Waiting list place: ${show(b.position)} → ${show(a.position)}`);
  if ((b.rank ?? null) !== (a.rank ?? null)) out.push(`Rank: ${show(b.rank)} → ${show(a.rank)}`);
  const cb = (b.conditions ?? []).join(" ");
  const ca = (a.conditions ?? []).join(" ");
  if (cb !== ca) out.push(`Conditions: ${cb || "none"} → ${ca || "none"}`);
  return out;
}

/** Lines such as "weights.investment: 25 → 30" for an assumption change. */
function assumptionChanges(before: unknown, after: unknown): string[] {
  const out: string[] = [];
  const b = isObject(before) ? before : {};
  const a = isObject(after) ? after : {};
  const flat = (prefix: string, v: unknown, into: Record<string, string>) => {
    if (isObject(v)) for (const [k, x] of Object.entries(v)) flat(prefix ? `${prefix}.${k}` : k, x, into);
    else into[prefix] = show(v);
  };
  const fb: Record<string, string> = {};
  const fa: Record<string, string> = {};
  flat("", b, fb);
  flat("", a, fa);
  for (const key of Object.keys(fa)) if (fa[key] !== fb[key]) out.push(`${key}: ${fb[key] ?? "none"} → ${fa[key]}`);
  return out;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function groupEvents(events: EventRow[]): Group[] {
  const order: string[] = [];
  const map = new Map<string, Group>();
  for (const e of events) {
    let g = map.get(e.group_id);
    if (!g) {
      g = { groupId: e.group_id, trigger: e.trigger, actor: e.actor, summary: e.summary, at: e.at, undone: e.undone, undoable: false, header: null, rows: [] };
      map.set(e.group_id, g);
      order.push(e.group_id);
    }
    if (e.application_id === null) {
      g.header = e;
      g.undoable = e.undoable;
    } else g.rows.push(e);
    if (e.at > g.at) g.at = e.at;
  }
  return order.map((id) => map.get(id)!);
}

export default function AuditPage() {
  const desk = useDesk();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "off" | "paused">("loading");
  const [applicant, setApplicant] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/run/events?limit=500", { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; reason?: string; events: EventRow[] };
      if (j.ok) {
        setEvents(j.events);
        setState("ready");
      } else setState(j.reason === "off" ? "off" : "paused");
    } catch {
      setState("paused");
    }
  }, []);

  useEffect(() => {
    if (!desk.ready) return;
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 10_000);
    return () => clearInterval(t);
  }, [desk.ready, load, desk.runId]);

  // A save just finished somewhere: show it.
  useEffect(() => {
    if (desk.save === "saved") void load();
  }, [desk.save, load]);

  const groups = useMemo(() => groupEvents(events), [events]);
  const shown = useMemo(
    () =>
      groups.filter((g) => {
        if (trigger !== "all" && g.trigger !== trigger) return false;
        if (applicant !== "all" && !g.rows.some((r) => r.application_id === applicant)) return false;
        return true;
      }),
    [groups, applicant, trigger],
  );

  async function undo(groupId: string) {
    setBusyGroup(groupId);
    setFailed(null);
    try {
      const res = await fetch("/api/run/undo", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": encodeURIComponent(desk.actor) }, body: JSON.stringify({ groupId }) });
      const j = (await res.json()) as { ok: boolean };
      if (j.ok) await desk.refresh();
      else setFailed(groupId);
    } catch {
      setFailed(groupId);
    } finally {
      setBusyGroup(null);
      await load();
    }
  }

  const names = useMemo(() => Object.fromEntries(desk.ws.applications.map((a) => [a.id, a.name])), [desk.ws.applications]);

  if (!desk.ready) return <Loading />;

  const intro = "Every import, chat update, assumption change and manual override: when it happened, who did it, what set it off, and how decisions moved.";

  return (
    <>
      <PageHeader
        title="Audit log"
        intro={intro}
        action={
          <button className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      {state === "off" || state === "paused" ? (
        <EmptyState
          title={state === "off" ? "No audit log without saving" : "The audit log is unavailable"}
          text={state === "off" ? "Saving isn't available right now, so changes aren't being recorded." : "We couldn't load the log just now. Try Refresh in a moment."}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <div>
              <label className="label" htmlFor="audit-applicant">
                Applicant
              </label>
              <select id="audit-applicant" className="field" value={applicant} onChange={(e) => setApplicant(e.target.value)}>
                <option value="all">All applicants</option>
                {desk.ws.applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} {a.name ? `· ${a.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="audit-trigger">
                What set it off
              </label>
              <select id="audit-trigger" className="field" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="all">Everything</option>
                {TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="pb-3 text-sm text-muted" role="status" aria-live="polite">
              {shown.length} change{shown.length === 1 ? "" : "s"} shown
            </p>
          </div>

          {state === "loading" ? (
            <Loading />
          ) : groups.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              text="Imports, chat updates, assumption changes and manual overrides appear here as the team works. Import applications to start."
              action={<ImportButton />}
            />
          ) : shown.length === 0 ? (
            <Card className="p-6">No changes match. Try clearing a filter.</Card>
          ) : (
            <ol className="space-y-4">
              {shown.map((g) => {
                const info = triggerInfo(g.trigger);
                const delta = g.header && g.trigger === "assumption" ? assumptionChanges(g.header.before, g.header.after) : [];
                return (
                  <li key={g.groupId}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`stamp stamp-flat s-${info.tone}`}>{info.label}</span>
                            {g.undone && <span className="stamp stamp-flat s-withdrawn">Undone</span>}
                          </div>
                          <p className="mt-2 font-bold" style={{ overflowWrap: "anywhere" }}>
                            {g.summary}
                          </p>
                          <p className="text-sm text-muted">
                            <time dateTime={g.at}>{when(g.at)}</time> · by {g.actor}
                          </p>
                        </div>
                        {g.undoable && !g.undone && (
                          <div className="text-right">
                            <button className="btn btn-ghost btn-small" disabled={busyGroup === g.groupId} onClick={() => void undo(g.groupId)}>
                              {busyGroup === g.groupId ? "Undoing…" : "Undo"}
                            </button>
                            {failed === g.groupId && (
                              <p role="alert" className="mt-1 text-sm font-semibold text-danger">
                                <span aria-hidden="true">! </span>This can't be undone any more.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {delta.length > 0 && (
                        <ul className="mt-3 space-y-1 rounded-xl border border-soft-line bg-[#fbfcff] p-3 text-sm">
                          {delta.map((l) => (
                            <li key={l} className="mono" style={{ overflowWrap: "anywhere" }}>
                              {l}
                            </li>
                          ))}
                        </ul>
                      )}

                      {g.rows.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="desk-table">
                            <thead>
                              <tr>
                                <th>Applicant</th>
                                <th>Before → after</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r) => {
                                const lines = decisionChanges(r.before, r.after);
                                return (
                                  <tr key={r.id} style={r.application_id === applicant ? { background: "#f3f6ff" } : undefined}>
                                    <td className="whitespace-nowrap align-top">
                                      <span className="mono font-bold">{r.application_id}</span> {names[r.application_id ?? ""] ?? ""}
                                    </td>
                                    <td className="min-w-[260px]">
                                      {lines.length === 0 ? (
                                        <span className="text-muted">No visible change</span>
                                      ) : (
                                        <ul className="space-y-0.5">
                                          {lines.map((l) => (
                                            <li key={l} style={{ overflowWrap: "anywhere" }}>
                                              {l}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {g.rows.length === 0 && delta.length === 0 && <p className="mt-3 text-sm text-muted">No applicant&apos;s decision changed.</p>}
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </>
  );
}
