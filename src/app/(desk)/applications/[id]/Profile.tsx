"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { useStatusLinks } from "@/lib/links";
import { toRunInput } from "@/lib/workspace";
import type { DiffCard } from "@/lib/diffcard";
import { STAGE_STATUSES, buildTimeline, partnerChecklist, stageWindow, stagesFor, trainingPlan, type StageKey, type StageStatus } from "@/engine/plans";
import { scenariosFor } from "@/engine/rerun";
import { STATUS_LABEL } from "@/engine/run";
import type { Application, Status, TrailItem } from "@/engine/types";
import { TEAM_NOTE_MAX } from "@/engine/messages";
import { Card, EmptyState, Loading, PART_LABEL, ScoreBreakdown, ScoreTag, StatusStamp } from "@/components/ui";
import { MessagePanel } from "@/components/MessagePanel";
import { DiffCardView } from "@/components/DiffCardView";

const CHOICES: Status[] = ["approved", "conditional", "redirected", "waiting", "needs_info", "not_in_plan", "not_eligible", "withdrawn"];

const TRAIL_STYLE: Record<TrailItem["result"], { mark: string; label: string; cls: string }> = {
  pass: { mark: "✓", label: "Passed", cls: "text-[#0e6b43] bg-[#d9f5e5]" },
  fail: { mark: "✗", label: "Failed", cls: "text-[#b3001b] bg-[#ffe0dc]" },
  warn: { mark: "!", label: "Check", cls: "text-[#7a4a00] bg-[#fff0c2]" },
  info: { mark: "i", label: "Note", cls: "text-[#1d3fc4] bg-[#e1e8ff]" },
};

interface EventRow {
  id: number;
  group_id: string;
  application_id: string | null;
  trigger: string;
  actor: string;
  summary: string;
  before: { status?: string; score?: number | null; pin?: string | null } | null;
  after: { status?: string; score?: number | null; pin?: string | null } | null;
  undone: boolean;
  undoable: boolean;
  at: string;
}

const dayText = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const shortDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const STATUS_WORD = (s?: string) => (s && s in STATUS_LABEL ? STATUS_LABEL[s as Status] : (s ?? "—"));

function History({ id, refreshKey }: { id: string; refreshKey: string }) {
  const desk = useDesk();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/run/events?application=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { events?: EventRow[] }) => !cancelled && setEvents(j.events ?? []))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey, bump]);

  async function undo(groupId: string) {
    setBusy(groupId);
    try {
      await fetch("/api/run/undo", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": encodeURIComponent(desk.actor) }, body: JSON.stringify({ groupId }) });
      await desk.refresh();
      setBump((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  if (events === null) return <p className="text-muted">Loading history…</p>;
  if (events.length === 0) return <p className="text-muted">No changes yet. Imports, chat updates, assumption changes and manual decisions that move this applicant are listed here.</p>;
  return (
    <ul className="space-y-3 text-sm">
      {events.map((e) => (
        <li key={e.id} className="rounded-xl border border-soft-line p-3">
          <p className="flex flex-wrap items-center gap-2">
            <span className="mono text-xs text-muted">{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="rounded-full bg-[#eef3fb] px-2 py-0.5 text-xs font-bold">{e.trigger}</span>
            <span className="text-muted">by {e.actor}</span>
            {e.undone && <span className="rounded-full bg-[#f5f5f4] px-2 py-0.5 text-xs font-bold">Undone</span>}
          </p>
          <p className="mt-1">{e.summary}</p>
          {(e.before || e.after) && (
            <p className="mt-1 text-xs text-muted">
              {STATUS_WORD(e.before?.status)}
              {e.before?.pin ? ` at ${e.before.pin}` : ""}
              {e.before?.score != null ? ` (score ${e.before.score})` : ""} <span aria-hidden="true">→</span> <strong className="text-ink">{STATUS_WORD(e.after?.status)}</strong>
              {e.after?.pin ? ` at ${e.after.pin}` : ""}
              {e.after?.score != null ? ` (score ${e.after.score})` : ""}
            </p>
          )}
          {e.undoable && !e.undone && (
            <button className="btn btn-ghost btn-small mt-2" disabled={busy === e.group_id} onClick={() => void undo(e.group_id)}>
              {busy === e.group_id ? "Undoing…" : "Undo"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const NOTE_IDEAS = ["Please call after 5 pm.", "We spoke on the phone and are glad to proceed.", "Please bring the shop's property papers to the site visit.", "Thank you for your patience while we reviewed your file."];

/** Where the evaluator writes something specific to this applicant. It goes into the message, never into the decision. */
function TeamNote({ app }: { app: Application }) {
  const { setTeamNote } = useDesk();
  const saved = app.teamNote ?? "";
  const [text, setText] = useState(saved);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => setText(saved), [saved, app.id]);
  const dirty = text.trim() !== saved.trim();
  const save = async () => {
    setState("saving");
    await setTeamNote(app.id, text);
    setState("saved");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <div className="mb-5 rounded-xl border border-soft-line bg-[#f7faff] p-4">
      <label htmlFor="team-note" className="font-bold">
        Your note for {app.name || app.id}
      </label>
      <p className="mb-2 text-sm text-muted">Anything specific you want this applicant to read. It is added to the end of the message in all three languages, exactly as you write it. It never changes the decision.</p>
      <textarea id="team-note" className="field min-h-[84px]" maxLength={TEAM_NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: We spoke on the phone. Please call after 5 pm." />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {NOTE_IDEAS.map((n) => (
          <button key={n} type="button" className="rounded-full border border-[#cdd6e6] bg-white px-3 py-1 text-xs font-semibold hover:bg-[#eef3ff]" onClick={() => setText((t) => (t.trim() ? t.trim() + " " + n : n).slice(0, TEAM_NOTE_MAX))}>
            + {n}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-small" disabled={!dirty || state === "saving"} onClick={save}>
          {state === "saving" ? "Saving…" : saved && !text.trim() ? "Remove note" : "Save note"}
        </button>
        {state === "saved" && <span className="text-sm font-semibold text-[#0e6b43]">Saved. The messages below now include it.</span>}
        <span className="ml-auto text-xs text-muted">
          {text.length} / {TEAM_NOTE_MAX}
        </span>
      </div>
    </div>
  );
}

interface ReplyItem {
  id: number;
  body: string;
  question: string | null;
  at: string;
}

/** What the applicant wrote on their status page. It never changes the decision; the team confirms any new fact. */
function Replies({ id }: { id: string }) {
  const { runId } = useDesk();
  const [items, setItems] = useState<ReplyItem[]>([]);
  useEffect(() => {
    if (!runId) return;
    let live = true;
    const load = () =>
      fetch("/api/run/replies?application=" + encodeURIComponent(id), { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok: boolean; replies?: ReplyItem[] }) => live && setItems(j.replies ?? []))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [runId, id]);
  if (items.length === 0) return null;
  const done = async (rid: number) => {
    setItems((x) => x.filter((r) => r.id !== rid));
    await fetch("/api/run/replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rid }) }).catch(() => undefined);
  };
  return (
    <section aria-labelledby="replies">
      <h2 id="replies" className="font-display-up mb-3 text-[18px] leading-tight">
        Reply from the applicant
      </h2>
      <Card className="border-[#f4d9a0] bg-[#fffaf0] p-5">
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border border-soft-line bg-white p-3">
              {r.question && <p className="text-xs text-muted">In answer to: {r.question}</p>}
              <p className="mt-1" style={{ overflowWrap: "anywhere" }}>
                {r.body}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted">{new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <button className="btn btn-ghost btn-small" onClick={() => done(r.id)}>
                  Mark as handled
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Nothing here changes the decision. Once you have confirmed a new fact, tell the assistant, for example: APP-012 found a 450 sq ft rented shop.</p>
      </Card>
    </section>
  );
}

export function ApplicantProfile({ id }: { id: string }) {
  const desk = useDesk();
  const { ready, ws, result, now, runId } = desk;
  const app = ws.applications.find((a) => a.id === id);
  const d = result.decisions[id];
  const asm = result.assumptions;

  const { links } = useStatusLinks();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Status>("not_eligible");
  const [reason, setReason] = useState("");
  const [card, setCard] = useState<DiffCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const scenarios = useMemo(() => (app && d ? scenariosFor(toRunInput(ws), id) : []), [app, d, ws, id]);
  const approvedOn = ws.approvedOn[id] ? new Date(ws.approvedOn[id]) : now;
  const refreshKey = d ? `${d.status}|${d.score}|${d.assignedPin}|${d.position}|${runId}` : "";

  const submitChange = useCallback(async () => {
    setSaving(true);
    try {
      const c = await desk.setOverride(id, choice, reason.trim());
      setCard(c);
      setOpen(false);
      setReason("");
    } finally {
      setSaving(false);
    }
  }, [desk, id, choice, reason]);

  if (!ready) return <Loading />;
  if (!app || !d)
    return <EmptyState title="Applicant not found" text="This application isn't in the current run. Go back to the list to pick one." action={<Link className="btn" href="/applications">Back to applications</Link>} />;

  const holds = d.status === "approved" || d.status === "conditional" || d.status === "redirected";
  const needsSpace = !d.hasSpace || d.condition.some((c) => c.kind === "space");
  const timeline = holds ? buildTimeline(app, d, now, asm) : null;
  const stageDefs = holds ? stagesFor(d) : [];
  const stageState = (key: string): StageStatus => ws.stages[id]?.[key] ?? "Not started";
  const training = holds ? trainingPlan(app, d, asm) : null;
  const checklist = holds ? partnerChecklist(app, d) : [];
  const checks = ws.checklist[id] ?? {};
  const groups = [...new Set(checklist.map((c) => c.group))];
  const total = d.parts ? Object.values(d.parts).reduce((a, b) => a + b, 0) : null;
  const weights = asm.weights;
  const e = d.earnBack;
  const scale = 40;

  return (
    <>
      <p className="mb-4">
        <Link href="/applications">← All applications</Link>
      </p>

      <Card className={`mb-6 p-6 tint-${d.status}`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="mono text-sm text-muted">
              {app.id} · {app.city} · pin {app.pin || "not provided"}
              {d.territoryId ? ` · ${d.territoryId}` : ""}
              {app.row ? ` · row ${app.row}` : ""}
            </p>
            <h1 className="page-title mt-1">{app.name || "Name not provided"}</h1>
            <p className="mt-3 max-w-2xl text-[17px] font-semibold">{d.verdict}</p>
            {d.assignedPin && (
              <p className="mt-2 text-[15px]">
                {d.status === "redirected" ? "Offered pin code" : "Pin code"}: <strong className="mono">{d.assignedPin}</strong>
                {d.status === "redirected" && <span className="text-muted"> (asked for {app.pin})</span>}
              </p>
            )}
            <p className="mt-2 max-w-2xl text-[15px]">
              <strong>Next step:</strong> {d.nextStep}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusStamp status={d.status} />
            <ScoreTag score={d.score} />
          </div>
        </div>
        {d.status === "withdrawn" && (
          <p role="status" className="mt-4 rounded-xl border-2 border-dashed border-[#44403c] bg-white p-3 font-semibold">
            Withdrawn{app.withdrawnReason ? `: ${app.withdrawnReason}` : ""}. This applicant no longer competes for an opening, and the opening has gone to the next person.
          </p>
        )}
        {d.changedByTeam && (
          <p className="mt-4 rounded-xl border border-cobalt bg-[#f3f6ff] p-3 font-semibold">
            The team changed this decision to {STATUS_LABEL[d.changedByTeam.status]}. Reason: {d.changedByTeam.reason}
          </p>
        )}
        {ws.overrides[id] && !d.changedByTeam && (
          <p role="alert" className="mt-4 rounded-xl border border-danger bg-[#ffe0dc] p-3 font-semibold text-danger">
            <span aria-hidden="true">! </span>The team&apos;s change to {STATUS_LABEL[ws.overrides[id].status]} can&apos;t be used. It would break one store per pin code or the openings in this area. The rules decide for now.
          </p>
        )}
      </Card>

      {card && (
        <div className="mb-6">
          <DiffCardView card={card} onClose={() => setCard(null)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Replies id={id} />

          <section aria-labelledby="message">
            <h2 id="message" className="font-display-up mb-3 text-[18px] leading-tight">
              Message to the applicant
            </h2>
            <Card className="p-5">
              <TeamNote app={app} />
              <MessagePanel app={app} decision={d} link={links[id]} now={now} assumptions={asm} />
              {links[id] && (
                <div className="mt-5 border-t border-soft-line pt-4">
                  <p className="font-bold">Private status page</p>
                  <p className="text-sm text-muted">Shows only this applicant&apos;s own information, always up to date. No sign-in needed.</p>
                  <p className="mono mt-1 break-all text-sm">{links[id]}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <a className="btn btn-ghost btn-small" href={links[id]} target="_blank" rel="noreferrer">
                      Open it
                    </a>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(links[id]);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        } catch {
                          window.prompt("Copy this link:", links[id]);
                        }
                      }}
                    >
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section aria-labelledby="trail">
            <h2 id="trail" className="font-display-up mb-3 text-[18px] leading-tight">
              Why: every check, in order
            </h2>
            <Card className="p-5">
              <ol className="space-y-2">
                {d.reasonTrail.map((t, i) => {
                  const st = TRAIL_STYLE[t.result];
                  return (
                    <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-3">
                      <span className={`mt-0.5 inline-flex min-w-[78px] items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${st.cls}`}>
                        <span aria-hidden="true">{st.mark}</span>
                        {st.label}
                      </span>
                      <span>
                        <strong className="text-sm">{t.check}</strong>
                        <br />
                        <span className="text-[15px]">{t.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {d.suggestions.length > 0 && (
                <ul className="mt-4 space-y-2 rounded-xl border border-[#f4d9a0] bg-[#fffaf0] p-3 text-sm">
                  {d.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="change">
            <h2 id="change" className="font-display-up mb-3 text-[18px] leading-tight">
              What would change this
            </h2>
            <Card className="p-5">
              {d.status === "needs_info" ? (
                <p>
                  Answer this: <strong>{d.ask}</strong>
                </p>
              ) : d.status === "not_in_plan" ? (
                <p>Only a change to the plan would help: this pin code or city would need to be added to the areas.</p>
              ) : d.status === "withdrawn" ? (
                <p>Nothing. The applicant withdrew.</p>
              ) : (
                <>
                  {d.improvements.length > 0 && (
                    <div className="mb-3">
                      <p className="font-bold">The two changes that add the most points:</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {d.improvements.map((i) => (
                          <li key={i.change}>
                            {i.change} <strong>(+{i.gain} points)</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {scenarios.length > 0 ? (
                    <ul className="space-y-2">
                      {scenarios.map((s) => (
                        <li key={s.change} className={`rounded-xl border p-3 tint-${s.status}`}>
                          <span className="mr-2 inline-flex items-center gap-1 text-xs font-bold">
                            <span className={`dot dot-${s.status}`} aria-hidden="true" />
                            {STATUS_LABEL[s.status]}
                          </span>
                          {s.text}
                        </li>
                      ))}
                    </ul>
                  ) : d.improvements.length === 0 ? (
                    <p>{d.status === "approved" ? "Nothing needed." : "Nothing a single change would alter."}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted">Each line re-scores this applicant with one change and re-runs the whole area. Nothing is guessed.</p>
                </>
              )}
            </Card>
          </section>

          {d.competitors.length > 0 && (
            <section aria-labelledby="competitors">
              <h2 id="competitors" className="font-display-up mb-3 text-[18px] leading-tight">
                Others who asked for pin {app.pin}
              </h2>
              <Card className="overflow-x-auto">
                <table className="desk-table">
                  <caption className="sr-only">Applicants who asked for the same pin code</caption>
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Score</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-bold">
                      <td>{app.id} (this applicant)</td>
                      <td className="mono">{d.score ?? "—"}</td>
                      <td>
                        <StatusStamp status={d.status} flat />
                      </td>
                    </tr>
                    {d.competitors.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/applications/${c.id}`} className="mono font-bold">
                            {c.id}
                          </Link>{" "}
                          {ws.applications.find((a) => a.id === c.id)?.name}
                        </td>
                        <td className="mono">{c.score ?? "—"}</td>
                        <td>
                          <StatusStamp status={c.status} flat />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.tieBreak && (
                  <p className="border-t border-soft-line p-3 text-sm">
                    <strong>Tie-break:</strong> {d.tieBreak}
                  </p>
                )}
              </Card>
            </section>
          )}

          {timeline && (
            <section aria-labelledby="timeline">
              <h2 id="timeline" className="font-display-up mb-3 text-[18px] leading-tight">
                Getting ready to open: dated timeline
              </h2>
              <Card className="p-5">
                {d.condition.length > 0 && (
                  <div className="mb-4 rounded-xl border border-[#f4d9a0] bg-[#fffaf0] p-3">
                    <strong>Conditions</strong>
                    <ul className="mt-1 list-disc pl-5">
                      {d.condition.map((c, i) => (
                        <li key={i}>{c.text}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-sm">If a condition isn&apos;t met in time, the opening goes to the next person on the waiting list.</p>
                  </div>
                )}
                <p className={`mb-3 text-[15px] ${timeline.tooEarly ? "rounded-xl border border-danger bg-[#ffe0dc] p-3 font-semibold text-danger" : "text-muted"}`} role={timeline.tooEarly ? "alert" : undefined}>
                  {timeline.tooEarly && <span aria-hidden="true">! </span>}
                  {timeline.text}
                </p>
                <ol className="space-y-3">
                  {timeline.stages.map((s) => {
                    const st = stageState(s.key);
                    const w = stageWindow(approvedOn, s.key as StageKey, needsSpace, asm);
                    const overdue = st !== "Done" && w.end < now && !!ws.approvedOn[id];
                    return (
                      <li key={s.key} className="grid gap-2 border-b border-soft-line pb-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <p className="font-bold">
                            {s.n}. {s.name}
                          </p>
                          <p className="mono text-sm" style={{ color: timeline.tooEarly ? "#b3001b" : undefined }}>
                            {shortDay(s.start)} to {shortDay(s.end)} · {s.weeks} week{s.weeks === 1 ? "" : "s"} · {s.owner}
                          </p>
                          <p className="text-sm text-muted">{s.what}</p>
                          {overdue && (
                            <p className="text-sm font-bold text-danger">
                              <span aria-hidden="true">! </span>Overdue. This stage should have finished by {dayText(w.end)}.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="sr-only" htmlFor={`st-${s.key}`}>
                            Status of {s.name}
                          </label>
                          <select id={`st-${s.key}`} className="field !w-auto" value={st} onChange={(ev) => desk.setStage(id, s.key, ev.target.value as StageStatus)}>
                            {STAGE_STATUSES.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-sm text-muted">
                  {stageDefs.length} stages. Planned backwards from the target launch. Every stage starts as &quot;Not started&quot; and the expansion team updates it.
                </p>
              </Card>
            </section>
          )}

          {training && (
            <section aria-labelledby="training">
              <h2 id="training" className="font-display-up mb-3 text-[18px] leading-tight">
                Training in {training.language}
              </h2>
              <Card className="p-5">
                <p className="text-[17px]">
                  <strong>{training.programme}</strong>
                </p>
                <p className="mono mt-1 text-sm">
                  {training.days} days · {training.hours} hours · {training.language}
                </p>
                {training.focus.length > 0 && (
                  <>
                    <h3 className="font-display-up mt-4 text-[16px] leading-tight">Extra focus for this partner</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {training.focus.map((f) => (
                        <li key={f.module}>
                          <strong>{f.module}.</strong> {f.why}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3 className="font-display-up mt-4 text-[16px] leading-tight">Day by day</h3>
                <ol className="indic mt-1 space-y-1" lang={training.language === "Kannada" ? "kn" : training.language === "Hindi" ? "hi" : "en"}>
                  {training.sessions.map((s) => (
                    <li key={s.day} className="grid grid-cols-[64px_1fr] gap-2 text-sm">
                      <span className="mono font-bold">{s.day}</span>
                      <span>
                        {s.local}
                        {training.language !== "English" && s.local !== s.topic && <span className="block text-xs text-muted">{s.topic}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          )}

          {holds && (
            <section aria-labelledby="checklist">
              <h2 id="checklist" className="font-display-up mb-3 text-[18px] leading-tight">
                Partner checklist
              </h2>
              <Card className="p-5">
                {groups.map((g) => (
                  <fieldset key={g} className="mb-3">
                    <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{g}</legend>
                    <ul className="space-y-1">
                      {checklist
                        .filter((c) => c.group === g)
                        .map((c) => (
                          <li key={c.key}>
                            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
                              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1f4fd8]" checked={!!checks[c.key]} onChange={(ev) => desk.toggleChecklist(id, c.key, ev.target.checked)} />
                              <span className={checks[c.key] ? "text-muted line-through" : ""}>{c.text}</span>
                            </label>
                          </li>
                        ))}
                    </ul>
                  </fieldset>
                ))}
                <p className="text-sm text-muted">
                  {Object.values(checks).filter(Boolean).length} of {checklist.length} done.
                </p>
              </Card>
            </section>
          )}

        </div>

        <aside className="space-y-6">
          {d.parts && total !== null && (
            <section aria-labelledby="score">
              <h2 id="score" className="font-display-up mb-3 text-[18px] leading-tight">
                Score
              </h2>
              <Card className="p-5">
                <p className="mb-3">
                  <span className="big-num text-[48px] leading-none" style={{ color: "var(--cobalt)" }}>
                    {Math.round(total * 10) / 10}
                  </span>
                  <span className="ml-1 text-muted">out of 100</span>
                </p>
                <ScoreBreakdown parts={d.parts} weights={weights} />
                {d.businessBonus > 0 && (
                  <p className="mt-3 text-sm">
                    Includes <strong>+{d.businessBonus}</strong> inside {PART_LABEL.experience.toLowerCase()} for a footwear or similar retail background.
                  </p>
                )}
                <p className="mt-3 text-sm text-muted">
                  Setup cost for a Tier {d.tier} store is ₹{d.setupCost} lakh. The minimum score to get an opening is {asm.minScoreToAllocate}.
                </p>
              </Card>
            </section>
          )}

          {e && (
            <section aria-labelledby="payback">
              <h2 id="payback" className="font-display-up mb-3 text-[18px] leading-tight">
                Months to earn back the investment
              </h2>
              <Card className="p-5">
                <p className="big-num text-[56px] leading-none" style={{ color: e.slow ? "var(--error)" : "var(--cobalt)" }}>
                  {e.low}–{e.high}
                  <span className="ml-2 text-[22px] text-ink">months</span>
                </p>
                <p className="mt-1 text-sm">Most likely about {e.months} months.</p>
                <div className="relative mt-3 h-4 rounded-sm border border-[#b8c4dc] bg-[#f3f6fc]" role="img" aria-label={`${e.low} to ${e.high} months, against a ${asm.earnBackTargetMonths} month target`}>
                  <div className="absolute inset-y-0 rounded-sm" style={{ left: `${Math.min(100, (e.low / scale) * 100)}%`, width: `${Math.max(2, Math.min(100, ((e.high - e.low) / scale) * 100))}%`, background: e.high > asm.earnBackTargetMonths ? "var(--c-not_eligible)" : "var(--cobalt)" }} />
                  <div className="absolute -inset-y-1 w-[3px] bg-ink" style={{ left: `${(asm.earnBackTargetMonths / scale) * 100}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  The black line is our {asm.earnBackTargetMonths}-month target.{" "}
                  {e.high > asm.earnBackTargetMonths ? "At the low end of sales this takes longer than the target." : "Within the target across the range."} Sales are varied by ±{asm.salesRangePct}%.
                  {e.assumedRented ? " Worked out as if the space is rented." : ""}
                </p>
              </Card>
            </section>
          )}

          <section aria-labelledby="application">
            <h2 id="application" className="font-display-up mb-3 text-[18px] leading-tight">
              Application
            </h2>
            <Card className="p-5">
              <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
                {[
                  ["Investment", app.investment === null ? "Not provided" : `₹${app.investment} lakh`],
                  ["Experience", app.experience === null ? "Not provided" : `${app.experience} years`],
                  ["Business", app.business || "Not provided"],
                  ["Space", app.space ?? "Not provided"],
                  ["Size", app.size === null ? "Not provided" : `${app.size} sq ft`],
                  ["Floor", app.floor ?? "Not provided"],
                  ["Target launch", app.target === null ? "Not provided" : `${app.target} months`],
                  ["Language", app.language],
                  ["Notes", app.notes || "None"],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-bold">{k}</dt>
                    <dd style={{ overflowWrap: "anywhere" }}>{v}</dd>
                  </div>
                ))}
              </dl>
              {app.cleaned && app.cleaned.length > 0 && (
                <div className="mt-3 border-t border-soft-line pt-2 text-xs text-muted">
                  <p className="font-bold">Values we cleaned when reading the file:</p>
                  <ul className="list-disc pl-4">
                    {app.cleaned.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>

          <section aria-labelledby="decide">
            <h2 id="decide" className="font-display-up mb-3 text-[18px] leading-tight">
              Change this decision
            </h2>
            <Card className="p-5">
              <p className="mb-3 text-sm text-muted">The team can decide differently from the rules. You&apos;ll be asked for a reason, and it is saved in the history.</p>
              <div className="flex flex-wrap gap-3">
                <Dialog.Root open={open} onOpenChange={setOpen}>
                  <Dialog.Trigger asChild>
                    <button className="btn btn-ghost btn-small">Change this decision</button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
                    <Dialog.Content className="card fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 p-6" aria-describedby="chg-desc">
                      <Dialog.Title className="font-display-up text-[22px] leading-tight">Change this decision</Dialog.Title>
                      <p id="chg-desc" className="mt-2 text-sm text-muted">
                        An approval can&apos;t break the rules: one store per pin code, and no more approvals than openings. The rules are checked again after you save.
                      </p>
                      <label className="label mt-4" htmlFor="chg-status">
                        New decision
                      </label>
                      <select id="chg-status" className="field" value={choice} onChange={(ev) => setChoice(ev.target.value as Status)}>
                        {CHOICES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <label className="label mt-4" htmlFor="chg-reason">
                        Reason (required)
                      </label>
                      <textarea id="chg-reason" className="field" rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} />
                      <div className="mt-5 flex justify-end gap-3">
                        <Dialog.Close className="btn btn-ghost btn-small">Cancel</Dialog.Close>
                        <button className="btn btn-small" disabled={reason.trim().length < 3 || saving} onClick={() => void submitChange()}>
                          {saving ? "Saving…" : "Save decision"}
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
                {d.changedByTeam && (
                  <button className="btn btn-ghost btn-small" onClick={() => void desk.clearOverride(id).then(setCard)}>
                    Let the rules decide again
                  </button>
                )}
              </div>
            </Card>
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="font-display-up mb-3 text-[18px] leading-tight">
              History
            </h2>
            <Card className="p-5">
              <Tabs.Root defaultValue="applicant">
                <Tabs.List className="mb-3 flex gap-2" aria-label="History view">
                  <Tabs.Trigger value="applicant" className="min-h-[44px] rounded-full border border-[#cdd6e6] px-4 font-semibold data-[state=active]:border-cobalt data-[state=active]:bg-[#e8efff]">
                    This applicant
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="applicant">
                  <History id={id} refreshKey={refreshKey} />
                </Tabs.Content>
              </Tabs.Root>
            </Card>
          </section>
        </aside>
      </div>
    </>
  );
}
