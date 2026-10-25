"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { useStatusLinks } from "@/lib/links";
import { STAGE_STATUSES, launchCheck, stagesFor, stageWindow, trainingPlan, type StageStatus } from "@/engine/plans";
import { STATUS_LABEL } from "@/engine/run";
import { whatWouldChange } from "@/engine/rerun";
import type { Status } from "@/engine/types";
import { Card, EmptyState, Lace, Loading, ScoreBreakdown, ScoreTag, SectionTitle, StatusStamp } from "@/components/ui";
import { MessagePanel } from "@/components/MessagePanel";

const CHOICES: Status[] = ["approved", "conditional", "needs_info", "waiting", "not_eligible"];

export function ApplicantProfile({ id }: { id: string }) {
  const desk = useDesk();
  const { ready, ws, result, now } = desk;
  const app = ws.applications.find((a) => a.id === id);
  const d = result.decisions[id];

  const items = useMemo(() => (app && d ? [{ app, decision: d, stages: ws.stages[id] }] : []), [app, d, ws.stages, id]);
  const { links } = useStatusLinks(items, now);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Status>("not_eligible");
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);

  const change = useMemo(
    () => (app && d ? whatWouldChange({ applications: ws.applications, territories: ws.territories, stores: ws.stores, overrides: ws.overrides }, id) : ""),
    [app, d, ws.applications, ws.territories, ws.stores, ws.overrides, id],
  );

  if (!ready) return <Loading />;
  if (!app || !d)
    return (
      <EmptyState title="Applicant not found" text="This application isn't in the current list. Go back to the list to pick one." action={<Link className="btn" href="/applications">Back to applications</Link>} />
    );

  const approved = d.status === "approved" || d.status === "conditional";
  const stages = stagesFor(d);
  const withZero = d.condition.some((c) => c.kind === "space");
  const approvedOn = ws.approvedOn[id] ? new Date(ws.approvedOn[id]) : now;
  const stageState = (key: string): StageStatus => ws.stages[id]?.[key] ?? "Not started";
  const laceStates = stages.map((s, i) => {
    const st = stageState(s.key);
    if (st === "Done") return "done" as const;
    if (st === "Stuck") return "stuck" as const;
    const prevDone = i === 0 || stageState(stages[i - 1].key) === "Done";
    return st === "In progress" || prevDone ? ("now" as const) : ("todo" as const);
  });
  const training = approved ? trainingPlan(app, d) : null;
  const launch = approved ? launchCheck(app, d, now) : null;
  const log = ws.log.filter((l) => l.id === id);
  const tier = d.tier ?? 2;

  return (
    <>
      <p className="mb-4">
        <Link href="/applications">← All applications</Link>
      </p>

      <Card className="mb-8 p-6" selected={d.status === "approved"}>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="mono text-sm text-muted">
              {app.id} · {app.city} · pin {app.pin || "not provided"} {d.territoryId ? `· ${d.territoryId}` : ""}
            </p>
            <h1 className="page-title mt-1" style={{ fontSize: "clamp(36px,6vw,60px)" }}>
              {app.name || "Name not provided"}
            </h1>
            <p className="mt-3 max-w-2xl text-[17px] font-semibold">{d.verdict}</p>
          </div>
          <div className="flex flex-col items-end gap-4">
            <StatusStamp status={d.status} />
            <ScoreTag score={d.score} />
          </div>
        </div>
        {d.changedByTeam && (
          <p className="mt-4 rounded-md border-2 border-ink bg-lime p-3 font-semibold">
            The team changed this decision to {STATUS_LABEL[d.changedByTeam.status]}. Reason: {d.changedByTeam.reason}
          </p>
        )}
      </Card>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-8">
          <section>
            <SectionTitle>Why</SectionTitle>
            <Card className="p-5">
              <ul className="list-disc space-y-2 pl-5">
                {d.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {d.status === "waiting" && d.ahead.length > 0 && <li>Ahead of this applicant: {d.ahead.join(", ")}.</li>}
              </ul>
              {d.checks.length > 0 && (
                <>
                  <h3 className="font-display-up mt-5 text-[22px]">Things to check</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {d.checks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {d.suggestions.length > 0 && (
                <>
                  <h3 className="font-display-up mt-5 text-[22px]">Suggested update to confirm</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {d.suggestions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-muted">To see what this would change, ask the assistant, for example “{app.id} found a ground-floor shop, 450 sq ft, rented”.</p>
                </>
              )}
              <div className="mt-5 rounded-md border-2 border-ink bg-lime/60 p-3">
                <strong>What would change this: </strong>
                {change}
              </div>
            </Card>
          </section>

          {approved && (
            <section>
              <SectionTitle>Getting ready to open</SectionTitle>
              <Card className="p-5">
                {d.condition.length > 0 && (
                  <div className="mb-4 rounded-md border-2 p-3" style={{ background: "#ffe39a", borderColor: "#7a4a00" }}>
                    <strong>Condition</strong>
                    <ul className="mt-1 list-disc pl-5">
                      {d.condition.map((c, i) => (
                        <li key={i}>{c.text}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-sm">If it isn't met, the opening goes to the next person on the waiting list.</p>
                  </div>
                )}
                <div className="mb-5 overflow-x-auto pb-2">
                  <Lace states={laceStates} />
                </div>
                <ol className="space-y-3">
                  {stages.map((s) => {
                    const st = stageState(s.key);
                    const w = stageWindow(approvedOn, s, withZero && s.n !== 0);
                    const overdue = st !== "Done" && w.end < now;
                    return (
                      <li key={s.key} className="grid gap-2 border-b border-soft-line pb-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <p className="font-bold">
                            {s.n === 0 ? "Start" : `${s.n}.`} {s.name}{" "}
                            <span className="mono text-sm font-normal text-muted">
                              {s.n === 0 ? "first 30 days" : `weeks ${s.from}–${s.to}`} · {s.owner}
                            </span>
                          </p>
                          <p className="text-sm text-muted">{s.what}</p>
                          {overdue && <p className="text-sm font-bold text-danger">! Overdue. This stage should have finished by {w.end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.</p>}
                        </div>
                        <div>
                          <label className="sr-only" htmlFor={`st-${s.key}`}>
                            Status of {s.name}
                          </label>
                          <select id={`st-${s.key}`} className="field !w-auto" value={st} onChange={(e) => desk.setStage(id, s.key, e.target.value as StageStatus)}>
                            {STAGE_STATUSES.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-sm text-muted">Every stage starts as “Not started”. The expansion team updates it as the work moves.</p>
              </Card>
            </section>
          )}

          {approved && training && (
            <section>
              <SectionTitle>Training</SectionTitle>
              <Card className="p-5">
                <p className="text-[17px]">
                  <strong>{training.programme}</strong>: {training.duration}, in {training.language}.
                </p>
                {training.basics.length > 0 && <p className="mt-2">Starts with: {training.basics.join(" and ")}.</p>}
                {training.focus.length > 0 && (
                  <>
                    <h3 className="font-display-up mt-4 text-[22px]">Extra focus for this partner</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {training.focus.map((f) => (
                        <li key={f.module}>
                          <strong>{f.module}.</strong> {f.why}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3 className="font-display-up mt-4 text-[22px]">Kicks modules</h3>
                <p className="text-sm text-muted">{training.modules.join(" · ")}</p>
              </Card>
            </section>
          )}

          {d.offers.length > 0 && (
            <section>
              <SectionTitle>Other options to offer</SectionTitle>
              <Card className="p-5">
                <ul className="space-y-2">
                  {d.offers.map((o) => (
                    <li key={o.territoryId}>
                      <strong>
                        {o.territoryId} · {o.city}
                      </strong>{" "}
                      — free pin codes <span className="mono">{o.pins.join(", ")}</span>, {o.openingsLeft} opening(s) left, {o.priority} priority. The applicant must agree.
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>Message to the applicant</SectionTitle>
            <Card className="p-5">
              <MessagePanel app={app} decision={d} link={links[id]} now={now} />
              {links[id] && (
                <div className="mt-5 border-t-2 border-soft-line pt-4">
                  <p className="font-bold">Private status page</p>
                  <p className="text-sm text-muted">Only this applicant's own information is on it. It does not need a sign-in.</p>
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
        </div>

        <aside className="space-y-8">
          {d.parts && (
            <section>
              <SectionTitle>Score</SectionTitle>
              <Card className="p-5">
                <ScoreBreakdown parts={d.parts} />
                <p className="mt-3 text-sm text-muted">Setup cost for a Tier {tier} store is ₹{d.setupCost} lakh.</p>
              </Card>
            </section>
          )}

          {d.earnBack && (
            <section>
              <SectionTitle>Months to earn back the investment</SectionTitle>
              <Card className="p-5">
                <p className="font-display-up text-[64px] leading-none" style={{ color: "var(--orange)" }}>
                  {d.earnBack.months}
                  <span className="ml-2 text-[24px] text-ink">months</span>
                </p>
                <div className="relative mt-3 h-4 overflow-hidden rounded-sm border-2 border-ink bg-box" role="img" aria-label={`${d.earnBack.months} months against a 30 month target`}>
                  <div className="h-full" style={{ width: `${Math.min(100, (d.earnBack.months / 40) * 100)}%`, background: d.earnBack.slow ? "var(--error)" : "var(--ink)" }} />
                  <div className="absolute inset-y-0 w-[3px] bg-orange" style={{ left: `${(30 / 40) * 100}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  Our target is 30 months or less.{d.earnBack.slow ? " This takes longer than the target." : ""}
                  {d.earnBack.assumedRented ? " Worked out as if the space is rented." : ""}
                </p>
              </Card>
            </section>
          )}

          {launch && (
            <section>
              <SectionTitle>Launch check</SectionTitle>
              <Card className="p-5">
                <p>
                  <span aria-hidden="true" className="font-bold">
                    {launch.ok ? "✓ " : "! "}
                  </span>
                  {launch.text}
                </p>
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>Application</SectionTitle>
            <Card className="p-5">
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
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
            </Card>
          </section>

          <section>
            <SectionTitle>Change this decision</SectionTitle>
            <Card className="p-5">
              <p className="mb-3 text-sm text-muted">The team can decide differently from the rules. You'll be asked for a reason, and it is saved in the history below.</p>
              <div className="flex flex-wrap gap-3">
                <Dialog.Root open={open} onOpenChange={setOpen}>
                  <Dialog.Trigger asChild>
                    <button className="btn btn-ghost btn-small">Change this decision</button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
                    <Dialog.Content className="card fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 p-6" aria-describedby="chg-desc">
                      <Dialog.Title className="font-display-up text-[30px] leading-none">Change this decision</Dialog.Title>
                      <p id="chg-desc" className="mt-2 text-sm text-muted">
                        An approval can't break the rules: one store per pin code, and no more approvals than openings. The rules are checked again after you save.
                      </p>
                      <label className="label mt-4" htmlFor="chg-status">
                        New decision
                      </label>
                      <select id="chg-status" className="field" value={choice} onChange={(e) => setChoice(e.target.value as Status)}>
                        {CHOICES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <label className="label mt-4" htmlFor="chg-reason">
                        Reason (required)
                      </label>
                      <textarea id="chg-reason" className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                      <div className="mt-5 flex justify-end gap-3">
                        <Dialog.Close className="btn btn-ghost btn-small">Cancel</Dialog.Close>
                        <button
                          className="btn btn-small"
                          disabled={reason.trim().length < 3}
                          onClick={() => {
                            desk.setOverride(id, choice, reason.trim());
                            setOpen(false);
                            setReason("");
                          }}
                        >
                          Save decision
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
                {d.changedByTeam && (
                  <button className="btn btn-ghost btn-small" onClick={() => desk.clearOverride(id)}>
                    Let the rules decide again
                  </button>
                )}
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>History</SectionTitle>
            <Card className="p-5">
              {log.length === 0 ? (
                <p className="text-muted">No changes yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {log.map((l, i) => (
                    <li key={i}>
                      <span className="mono text-muted">{new Date(l.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> · {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </aside>
      </div>
    </>
  );
}
