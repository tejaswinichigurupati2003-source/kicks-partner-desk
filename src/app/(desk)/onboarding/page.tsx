"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDesk } from "@/lib/desk";
import { STAGE_DEFS, buildTimeline, stagesFor, stageWindow, trainingPlan } from "@/engine/plans";
import { HOLDS_OPENING } from "@/engine/run";
import { Card, EmptyState, ImportButton, Loading, PageHeader, SectionTitle, StatusStamp } from "@/components/ui";

export default function Onboarding() {
  const { ready, hasData, ws, result, now } = useDesk();
  const asm = result.assumptions;

  const rows = useMemo(() => {
    return ws.applications
      .map((a) => ({ a, d: result.decisions[a.id] }))
      .filter((r) => r.d && HOLDS_OPENING.includes(r.d.status))
      .map(({ a, d }) => {
        const stages = stagesFor(d);
        const needsSpace = !d.hasSpace || d.condition.some((c) => c.kind === "space");
        const state = (key: string) => ws.stages[a.id]?.[key] ?? "Not started";
        const current = stages.find((s) => state(s.key) !== "Done") ?? null;
        const on = ws.approvedOn[a.id] ? new Date(ws.approvedOn[a.id]) : now;
        const overdue = stages.some((s) => state(s.key) !== "Done" && stageWindow(on, s.key, needsSpace, asm).end < now);
        const stuck = stages.some((s) => state(s.key) === "Stuck");
        const done = stages.filter((s) => state(s.key) === "Done").length;
        const days = d.condition.length ? Math.ceil((on.getTime() + asm.conditionDays * 86400000 - now.getTime()) / 86400000) : null;
        return { a, d, stages, current, overdue, stuck, done, days, plan: trainingPlan(a, d, asm), timeline: buildTimeline(a, d, now, asm) };
      });
  }, [ws, result, now, asm]);

  if (!ready) return <Loading />;
  const intro = "Everyone who has been given an opening, and where they are on the way to opening: which stage, who is late, how they will be trained, and when they should open.";
  if (!hasData || rows.length === 0)
    return (
      <>
        <PageHeader title="Getting ready to open" intro={intro} />
        <EmptyState
          title={hasData ? "Nobody has an opening yet" : "No applications yet"}
          text={hasData ? "When applicants are approved or redirected, they appear here with their stages and training." : "Import applications to see who is ready to start."}
          action={
            hasData ? (
              <Link className="btn" href="/applications">
                See applications
              </Link>
            ) : (
              <ImportButton />
            )
          }
        />
      </>
    );

  const opened = rows.filter((r) => r.stages.every((s) => (ws.stages[r.a.id]?.[s.key] ?? "Not started") === "Done")).length;
  const programmes = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.plan.days} days · ${r.plan.language}`;
    programmes.set(k, (programmes.get(k) ?? 0) + 1);
  }
  const date = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title="Getting ready to open" intro={intro} />
      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Totals">
        {[
          ["Getting ready", rows.length - opened],
          ["Overdue", rows.filter((r) => r.overdue).length],
          ["Stuck", rows.filter((r) => r.stuck).length],
          ["Ready to open", opened],
        ].map(([label, n]) => (
          <Card key={label as string} className="p-4">
            <div className="big-num text-[56px] leading-none" style={{ color: "var(--orange)" }}>
              {n}
            </div>
            <div className="font-bold">{label}</div>
          </Card>
        ))}
      </section>

      <SectionTitle>Where everyone is</SectionTitle>
      <div className="mb-10 overflow-x-auto pb-3">
        <div className="flex min-w-max gap-4">
          {STAGE_DEFS.map((c, i) => {
            const here = rows.filter((r) => r.current?.key === c.key);
            return (
              <div key={c.key} className="w-[190px] shrink-0">
                <h3 className="border-b-2 border-[#cdd6e6] pb-1 text-[15px] font-bold leading-tight">
                  {i + 1}. {c.name} <span className="mono text-sm">({here.length})</span>
                </h3>
                <ul className="mt-2 space-y-2">
                  {here.map((r) => (
                    <li key={r.a.id}>
                      <Link href={`/applications/${r.a.id}`} className={`card card-link p-2 text-sm no-underline tint-${r.d.status}`} style={{ boxShadow: r.overdue ? "0 0 0 2px var(--error)" : undefined }}>
                        <span className="mono font-bold">{r.a.id}</span> {r.a.name}
                        <br />
                        <span className="text-muted">{r.a.city}</span>
                        {r.overdue && <span className="block font-bold text-danger">! Overdue</span>}
                        {r.stuck && <span className="block font-bold text-danger">! Stuck</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle>Partners and launch dates</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="desk-table">
              <caption className="sr-only">Partners with their current stage, launch date and training</caption>
              <thead>
                <tr>
                  <th scope="col">Decision</th>
                  <th scope="col">Partner</th>
                  <th scope="col">Now</th>
                  <th scope="col">Stages done</th>
                  <th scope="col">Realistic opening</th>
                  <th scope="col">Training</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.a.id} className={`row-${r.d.status}`}>
                    <td>
                      <StatusStamp status={r.d.status} flat />
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/applications/${r.a.id}`} className="mono font-bold">
                        {r.a.id}
                      </Link>{" "}
                      {r.a.name}
                    </td>
                    <td>
                      {r.current ? r.current.name : "Ready to open"}
                      {r.days !== null && <span className="block text-sm text-muted">{r.days >= 0 ? `${r.days} day(s) left on the condition` : "Condition date has passed"}</span>}
                    </td>
                    <td className="mono">
                      {r.done}/{r.stages.length}
                    </td>
                    <td className="whitespace-nowrap">
                      {date(r.timeline.realisticLaunch)}
                      {r.timeline.tooEarly && (
                        <span className="block text-sm font-semibold text-danger">
                          <span aria-hidden="true">! </span>Target is {r.timeline.weeksTooEarly} week(s) too early
                        </span>
                      )}
                    </td>
                    <td className="min-w-[160px] text-sm">
                      {r.plan.days} days, {r.plan.language}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
        <section>
          <SectionTitle>Training to plan</SectionTitle>
          <Card className="p-5">
            <ul className="space-y-2">
              {[...programmes.entries()].map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3 border-b border-soft-line pb-1">
                  <span>{k}</span>
                  <span className="mono font-bold">{n}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Group partners by language and programme to plan trainers and dates.</p>
          </Card>
        </section>
      </div>
    </>
  );
}
