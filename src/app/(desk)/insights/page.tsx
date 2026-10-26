"use client";

import { useDesk } from "@/lib/desk";
import { STAGE_DEFS } from "@/engine/plans";
import { HOLDS_OPENING } from "@/engine/run";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Bar, Card, EmptyState, ImportButton, Loading, PageHeader, SectionTitle } from "@/components/ui";

export default function Insights() {
  const { ready, hasData, ws, result } = useDesk();
  if (!ready) return <Loading />;
  const intro = "Progress from application to opening, how full each area is, and where we need more applicants.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Insights" intro={intro} />
        <EmptyState title="Nothing to show yet" text="Import applications to see progress, area fill and gaps." action={<ImportButton />} />
      </>
    );
  const decisions = Object.values(result.decisions);
  const total = decisions.length;
  const count = (s: Status) => decisions.filter((d) => d.status === s).length;
  const approved = decisions.filter((d) => HOLDS_OPENING.includes(d.status));
  const stageDone = (key: string) => approved.filter((d) => ws.stages[d.id]?.[key] === "Done").length;
  const decided = Object.keys(ws.overrides).length;
  const thin = result.territories.filter((t) => t.applicants.length < t.territory.slots);

  return (
    <>
      <PageHeader title="Insights" intro={intro} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Progress from application to opening</SectionTitle>
          <Card className="space-y-4 p-5">
            {[
              ["Applications received", total],
              ["Given an opening (approved, with a condition, or redirected)", approved.length],
              ...STAGE_DEFS.map((s) => [`Done: ${s.name}`, stageDone(s.key)] as [string, number]),
            ].map(([label, n]) => (
              <div key={label as string}>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{label}</span>
                  <span className="mono">{n}</span>
                </div>
                <Bar value={n as number} max={Math.max(total, 1)} label={`${label}: ${n} of ${total}`} />
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle>Decisions</SectionTitle>
          <Card className="space-y-4 p-5">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <div key={s}>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{STATUS_LABEL[s]}</span>
                  <span className="mono">{count(s)}</span>
                </div>
                <Bar value={count(s)} max={Math.max(total, 1)} label={`${STATUS_LABEL[s]}: ${count(s)} of ${total}`} />
              </div>
            ))}
            <p className="text-sm text-muted">{decided} decision(s) changed by the team.</p>
          </Card>
        </section>

        <section>
          <SectionTitle>How full each area is</SectionTitle>
          <Card className="space-y-4 p-5">
            {result.territories.map((r) => (
              <div key={r.territory.id}>
                <div className="flex justify-between text-sm font-semibold">
                  <span>
                    {r.territory.id} · {r.territory.city}
                  </span>
                  <span className="mono">
                    {r.approved.length + r.redirected.length}/{r.territory.slots} · {r.waiting.length} waiting
                  </span>
                </div>
                <Bar value={r.approved.length + r.redirected.length} max={r.territory.slots} label={`${r.approved.length + r.redirected.length} of ${r.territory.slots} openings used`} />
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle>Where we need more applicants</SectionTitle>
          <Card className="p-5">
            {thin.length === 0 ? (
              <p>Every area has at least as many applicants as openings.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {thin.map((r) => (
                  <li key={r.territory.id}>
                    <strong>
                      {r.territory.id} · {r.territory.city}
                    </strong>
                    : {r.applicants.length} applicant(s) for {r.territory.slots} openings ({r.territory.priority} priority).
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="lg:col-span-2">
          <SectionTitle>Time and usage</SectionTitle>
          <Card className="p-5">
            <p className="text-muted">Time spent in each stage and weekly use starts filling in as the team uses the Desk.</p>
          </Card>
        </section>
      </div>
    </>
  );
}
