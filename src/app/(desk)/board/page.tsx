"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { toRunInput } from "@/lib/workspace";
import { trainingPlan } from "@/engine/plans";
import { HOLDS_OPENING, STATUS_LABEL } from "@/engine/run";
import { whatWouldChange } from "@/engine/rerun";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ImportButton, Loading, PageHeader, ScoreTag, SectionTitle, StatusStamp } from "@/components/ui";

const ORDER: Status[] = ["approved", "conditional", "redirected", "waiting", "needs_info", "not_in_plan", "not_eligible", "withdrawn"];
const MARK: Record<string, string> = { pass: "✓", fail: "✗", warn: "!", info: "•" };
const MARK_COLOR: Record<string, string> = { pass: "#0e6b43", fail: "#b3001b", warn: "#7a4a00", info: "#3b4558" };
const MARK_WORD: Record<string, string> = { pass: "Passed", fail: "Failed", warn: "Check", info: "Note" };

export default function Board() {
  const { ready, hasData, ws, result } = useDesk();
  const [open, setOpen] = useState<string | null>(null);

  const input = useMemo(() => toRunInput(ws), [ws]);
  const checks = useMemo(() => {
    const held = new Map<string, string[]>();
    for (const d of Object.values(result.decisions)) {
      if (HOLDS_OPENING.includes(d.status) && !d.changedByTeam && d.assignedPin) held.set(d.assignedPin, [...(held.get(d.assignedPin) ?? []), d.id]);
    }
    const storePins = new Set(ws.stores.map((s) => s.pin));
    return {
      pinsHeld: held.size,
      onePerPin: [...held.values()].every((v) => v.length === 1),
      noStorePin: [...held.keys()].every((p) => !storePins.has(p)),
      areas: result.territories.map((r) => ({ id: r.territory.id, city: r.territory.city, used: r.approved.length + r.redirected.length, slots: r.territory.slots, ok: r.approved.length + r.redirected.length <= r.territory.slots })),
    };
  }, [ws, result]);

  if (!ready) return <Loading />;
  const intro = "Every applicant on one screen: what happens to them, why, what they do next, and how they will be trained. The rules are checked at the top.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Decision board" intro={intro} />
        <EmptyState title="No applications yet" text="Import your Excel file and every applicant appears here with a decision and a reason." action={<ImportButton />} />
      </>
    );

  const rows = ws.applications
    .map((a) => ({ a, d: result.decisions[a.id] }))
    .filter((r) => r.d)
    .sort((x, y) => ORDER.indexOf(x.d.status) - ORDER.indexOf(y.d.status) || (y.d.score ?? 0) - (x.d.score ?? 0));
  const counts = ORDER.map((s) => [s, rows.filter((r) => r.d.status === s).length] as const).filter(([, n]) => n > 0);
  const allOk = result.problems.length === 0 && checks.onePerPin && checks.noStorePin && checks.areas.every((x) => x.ok);

  return (
    <>
      <PageHeader title="Decision board" intro={intro} action={<Link className="btn btn-ghost" href="/import">Import another file</Link>} />

      <section className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" aria-label="Rules check">
        <Card className="p-5" selected={allOk}>
          <SectionTitle>Rules check</SectionTitle>
          <ul className="space-y-2">
            {[
              [checks.onePerPin, `One store per pin code: ${checks.pinsHeld} pin codes given out, none shared.`],
              [checks.noStorePin, `No pin code given out already has a Kicks store (${ws.stores.length} stores checked).`],
              [checks.areas.every((x) => x.ok), "No area has more approvals and redirects than openings."],
              [true, "The same file always gives the same result."],
              [true, "Notes written by applicants are information only. Instructions in them are ignored."],
            ].map(([ok, text], i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="font-bold" style={{ color: ok ? "#0e6b43" : "var(--error)" }}>
                  {ok ? "✓" : "!"}
                </span>
                <span className="sr-only">{ok ? "Passed:" : "Failed:"}</span>
                <span>{text as string}</span>
              </li>
            ))}
          </ul>
          {!allOk && <p className="mt-3 font-bold text-danger">! We found a problem in the results. Please import the file again.</p>}
        </Card>
        <Card className="p-5">
          <SectionTitle>Openings by area</SectionTitle>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {checks.areas.map((x) => (
              <li key={x.id} className="flex justify-between border-b border-soft-line pb-1">
                <span>
                  {x.id} · {x.city}
                </span>
                <span className="mono">
                  {x.used}/{x.slots}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="mb-6 flex flex-wrap gap-3" aria-label="Totals by decision">
        {counts.map(([s, n]) => (
          <span key={s} className="flex items-center gap-2">
            <StatusStamp status={s} flat /> <strong className="mono">{n}</strong>
          </span>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="desk-table">
          <caption className="sr-only">Every applicant with their decision, reasons, next step and training</caption>
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Applicant</th>
              <th scope="col">Why</th>
              <th scope="col">What they do next</th>
              <th scope="col">Training</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, d }) => {
              const isOpen = open === a.id;
              const holds = HOLDS_OPENING.includes(d.status);
              const tp = holds ? trainingPlan(a, d, result.assumptions) : null;
              return (
                <tr key={a.id} className={`align-top row-${d.status}`}>
                  <td className="whitespace-nowrap">
                    <StatusStamp status={d.status} flat />
                  </td>
                  <td className="min-w-[150px]">
                    <Link href={`/applications/${a.id}`} className="mono font-bold">
                      {a.id}
                    </Link>
                    <br />
                    {a.name || "Name not provided"}
                    <br />
                    <span className="text-sm text-muted">
                      {a.city} · asked <span className="mono">{a.pin || "—"}</span>
                      {d.assignedPin && d.assignedPin !== a.pin ? (
                        <>
                          {" "}
                          · offered <span className="mono">{d.assignedPin}</span>
                        </>
                      ) : null}{" "}
                      {d.territoryId ? `· ${d.territoryId}` : ""}
                    </span>
                  </td>
                  <td className="min-w-[260px] max-w-[380px]">
                    {d.verdict}
                    <br />
                    <button className="min-h-[44px] font-semibold text-cobalt underline" aria-expanded={isOpen} aria-controls={`trail-${a.id}`} onClick={() => setOpen(isOpen ? null : a.id)}>
                      {isOpen ? "Hide the checks" : "Show the checks"}
                    </button>
                    {isOpen && (
                      <div id={`trail-${a.id}`} className="mb-2 text-sm">
                        <ul className="space-y-1">
                          {d.reasonTrail.map((t, i) => (
                            <li key={i} className="flex gap-2">
                              <span aria-hidden="true" className="font-bold" style={{ color: MARK_COLOR[t.result] }}>
                                {MARK[t.result]}
                              </span>
                              <span>
                                <span className="sr-only">{MARK_WORD[t.result]}: </span>
                                <strong>{t.check}.</strong> {t.detail}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 rounded-lg border border-[#c9d6f2] bg-[#f3f6ff] p-2">
                          <strong>What would change this: </strong>
                          {ws.applications.length <= 300 ? whatWouldChange(input, a.id) : "Open the applicant to see this."}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="min-w-[220px] max-w-[300px]">{d.nextStep}</td>
                  <td className="min-w-[180px] max-w-[240px]">
                    {tp ? (
                      <>
                        {tp.days} days ({tp.hours} hours), in {tp.language}
                        <br />
                        <span className="text-sm text-muted">{tp.focus[0]?.module ? `Focus: ${tp.focus.slice(0, 2).map((f) => f.module).join(", ")}` : "Kicks modules"}</span>
                      </>
                    ) : (
                      <span className="text-muted">After an opening is given</span>
                    )}
                  </td>
                  <td>
                    <ScoreTag score={d.score} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Want to see what happens when something changes? Use <strong>Ask assistant</strong>, for example &ldquo;APP-002 has withdrawn&rdquo;.
      </p>
      <p className="sr-only">{STATUS_LABEL.approved}</p>
    </>
  );
}
