"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { trainingPlan } from "@/engine/plans";
import { STATUS_LABEL } from "@/engine/run";
import { whatWouldChange } from "@/engine/rerun";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ImportButton, Loading, PageHeader, ScoreTag, SectionTitle, StatusStamp } from "@/components/ui";

const ORDER: Status[] = ["approved", "conditional", "waiting", "needs_info", "not_eligible"];

export default function Board() {
  const { ready, hasData, ws, result } = useDesk();
  const [open, setOpen] = useState<string | null>(null);

  const input = useMemo(() => ({ applications: ws.applications, territories: ws.territories, stores: ws.stores, overrides: ws.overrides }), [ws]);
  const checks = useMemo(() => {
    const taken = new Map<string, string[]>();
    for (const a of ws.applications) {
      const d = result.decisions[a.id];
      if (d && (d.status === "approved" || d.status === "conditional")) taken.set(a.pin, [...(taken.get(a.pin) ?? []), a.id]);
    }
    const storePins = new Set(ws.stores.map((s) => s.pin));
    return {
      pinsApproved: taken.size,
      onePerPin: [...taken.values()].every((v) => v.length === 1),
      noStorePin: [...taken.keys()].every((p) => !storePins.has(p)),
      areas: result.territories.map((r) => ({ id: r.territory.id, city: r.territory.city, used: r.approved.length, slots: r.territory.slots, ok: r.approved.length <= r.territory.slots })),
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
  const counts = ORDER.map((s) => [s, rows.filter((r) => r.d.status === s).length] as const);
  const allOk = result.problems.length === 0 && checks.onePerPin && checks.noStorePin && checks.areas.every((x) => x.ok);

  const nextStep = (id: string) => {
    const d = result.decisions[id];
    if (d.status === "approved") return "Send ID and address proof, then site visit and financial checks.";
    if (d.status === "conditional") return d.condition[0]?.text ?? "Meet the condition.";
    if (d.status === "needs_info") return d.ask ?? "Reply with the missing detail.";
    if (d.status === "waiting") return d.offers.length ? `Offer: ${d.offers[0].city} (${d.offers[0].pins.slice(0, 2).join(", ")}).` : "Wait for an opening.";
    return "No action right now.";
  };

  return (
    <>
      <PageHeader title="Decision board" intro={intro} action={<Link className="btn btn-ghost" href="/import">Import another file</Link>} />

      <section className="mb-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5" selected={allOk}>
          <SectionTitle>Rules check</SectionTitle>
          <ul className="space-y-2">
            {[
              [checks.onePerPin, `One store per pin code: ${checks.pinsApproved} approved pin codes, none shared.`],
              [checks.noStorePin, `No approved pin code already has a Kicks store (${ws.stores.length} stores checked).`],
              [checks.areas.every((x) => x.ok), "No area has more approvals than openings."],
              [true, "The same file always gives the same result."],
              [true, "Notes written by applicants are information only. Instructions in them are ignored."],
            ].map(([ok, text], i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="font-bold" style={{ color: ok ? "#0e6b43" : "var(--error)" }}>
                  {ok ? "✓" : "!"}
                </span>
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

      <div className="mb-6 flex flex-wrap gap-3">
        {counts.map(([s, n]) => (
          <span key={s} className="flex items-center gap-2">
            <StatusStamp status={s} flat /> <strong className="mono">{n}</strong>
          </span>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Decision</th>
              <th>Applicant</th>
              <th>Why</th>
              <th>What they do next</th>
              <th>Training</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, d }) => {
              const isOpen = open === a.id;
              const approved = d.status === "approved" || d.status === "conditional";
              const tp = approved ? trainingPlan(a, d) : null;
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
                      {a.city} · <span className="mono">{a.pin}</span> {d.territoryId ? `· ${d.territoryId}` : ""}
                    </span>
                  </td>
                  <td className="min-w-[260px] max-w-[360px]">
                    {d.verdict}
                    <br />
                    <button className="min-h-[44px] font-semibold text-cobalt underline" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.id)}>
                      {isOpen ? "Hide reasons" : "Show reasons"}
                    </button>
                    {isOpen && (
                      <div className="mb-2 text-sm">
                        <ul className="list-disc space-y-1 pl-5">
                          {d.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                          {d.checks.map((c, i) => (
                            <li key={`c${i}`}>Check: {c}</li>
                          ))}
                        </ul>
                        <p className="mt-2 rounded border-2 border-ink bg-lime/60 p-2">
                          <strong>What would change this: </strong>
                          {ws.applications.length <= 300 ? whatWouldChange(input, a.id) : "Open the applicant to see this."}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="min-w-[220px] max-w-[300px]">{nextStep(a.id)}</td>
                  <td className="min-w-[180px] max-w-[240px]">
                    {tp ? (
                      <>
                        {tp.duration}, in {tp.language}
                        <br />
                        <span className="text-sm text-muted">{tp.focus[0]?.module ? `Focus: ${tp.focus.slice(0, 2).map((f) => f.module).join(", ")}` : "Kicks modules"}</span>
                      </>
                    ) : (
                      <span className="text-muted">After approval</span>
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
        Want to see what happens when something changes? Use <strong>Ask assistant</strong>, for example “APP-012 found a ground-floor shop, 450 sq ft, rented”.
      </p>
      <p className="sr-only">{STATUS_LABEL.approved}</p>
    </>
  );
}
