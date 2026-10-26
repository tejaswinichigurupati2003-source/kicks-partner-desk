"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { Card, EmptyState, ImportButton, Loading, PageHeader, SectionTitle, StatusStamp } from "@/components/ui";

type Kind = "pin" | "missing" | "notes" | "instructions" | "launch" | "space" | "duplicate" | "update" | "money";
const KIND_LABEL: Record<Kind, string> = {
  pin: "Pin code problems",
  missing: "Missing answers",
  money: "Investment gap",
  notes: "Notes disagree with the form",
  instructions: "Instructions in notes (ignored)",
  launch: "Launch target too early",
  space: "Space details to confirm",
  duplicate: "Duplicate applications",
  update: "Suggested updates to confirm",
};

function classify(check: string, text: string): Kind {
  if (/instructions that were ignored/i.test(text)) return "instructions";
  if (check === "Pin and city") return "pin";
  if (check === "Required answers") return "missing";
  if (check === "Investment") return "money";
  if (check === "Timeline" || /earlier than the realistic|target launch was not/i.test(text)) return "launch";
  if (check === "Space details") return "space";
  if (check === "Notes" && /Suggested update/i.test(text)) return "update";
  if (check === "Notes") return "notes";
  return "missing";
}

export default function DataReview() {
  const { ready, hasData, ws, result } = useDesk();
  const [kind, setKind] = useState<Kind | "all">("all");

  const issues = useMemo(() => {
    const list: { id: string; name: string; kind: Kind; text: string; blocking: boolean }[] = [];
    for (const a of ws.applications) {
      const d = result.decisions[a.id];
      if (!d) continue;
      if (d.duplicateOf) list.push({ id: a.id, name: a.name, kind: "duplicate", text: `Same name and pin code as ${d.duplicateOf}. The stronger application is used.`, blocking: true });
      for (const t of d.reasonTrail) {
        if (t.result === "fail" && ["Pin and city", "Required answers", "Investment"].includes(t.check)) list.push({ id: a.id, name: a.name, kind: classify(t.check, t.detail), text: t.detail, blocking: true });
        else if (t.result === "warn" && !["Nearby store", "Payback", "Condition"].includes(t.check)) list.push({ id: a.id, name: a.name, kind: classify(t.check, t.detail), text: t.detail, blocking: false });
        else if (t.result === "info" && t.check === "Notes") list.push({ id: a.id, name: a.name, kind: "update", text: t.detail, blocking: false });
      }
    }
    return list;
  }, [ws.applications, result]);

  if (!ready) return <Loading />;
  const intro = "Everything in your file that is missing, unclear or contradictory, and what we did about it. Nothing is changed for you without a check.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Data review" intro={intro} />
        <EmptyState title="No file imported yet" text="Import your Excel file to see which answers are missing or contradictory." action={<ImportButton />} />
      </>
    );

  const total = ws.applications.length;
  const clean = ws.applications.filter((a) => !issues.some((i) => i.id === a.id)).length;
  const counts = (Object.keys(KIND_LABEL) as Kind[]).map((k) => [k, issues.filter((i) => i.kind === k).length] as const).filter(([, n]) => n > 0);
  const shown = issues.filter((i) => kind === "all" || i.kind === kind);

  const areaNoApplicants = result.territories.filter((t) => t.applicants.length === 0);
  const storePinApplicants = ws.applications.filter((a) => ws.stores.some((s) => s.pin === a.pin));
  const outside = ws.applications.filter((a) => /^\d{6}$/.test(a.pin) && !ws.territories.some((t) => t.pins.includes(a.pin)));
  const health = ws.health;

  return (
    <>
      <PageHeader title="Data review" intro={intro} />
      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Totals">
        {[
          ["Applications read", total],
          ["Clean", clean],
          ["Need information", Object.values(result.decisions).filter((d) => d.status === "needs_info").length],
          ["Things to check", issues.filter((i) => !i.blocking).length],
        ].map(([label, n]) => (
          <Card key={label as string} className="p-4">
            <div className="big-num text-[56px] leading-none" style={{ color: "var(--orange)" }}>
              {n}
            </div>
            <div className="font-bold">{label}</div>
          </Card>
        ))}
      </section>

      <div className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>File check</SectionTitle>
          <p className="mb-2">
            {ws.fileName ?? "Your import"}: {total} applications, {ws.territories.length} areas, {ws.stores.length} existing stores.
          </p>
          {health ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{health.exampleRowSkipped ? `The template's example row (row ${health.exampleRow}) was skipped.` : "No example row was found."}</li>
              <li>{health.changes.length} value(s) were changed while cleaning.</li>
              <li>
                {health.errors.length} error(s) in the file
                {health.errors.length ? `: ${["Applications", "Territories", "Existing stores"].map((s) => `${health.errors.filter((e) => e.sheet === s).length} on ${s}`).join(", ")}` : ""}.
              </li>
              <li>
                <Link href="/import">See the full data health report</Link>
              </li>
            </ul>
          ) : ws.report.length === 0 ? (
            <p>Nothing was skipped or changed while reading the file.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {ws.report.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle>Areas and pin codes</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              {storePinApplicants.length} applicant(s) asked for a pin code that already has a store
              {storePinApplicants.length ? `: ${storePinApplicants.map((a) => a.id).join(", ")}` : ""}.
            </li>
            <li>
              {outside.length} applicant(s) asked for a pin code outside every area{outside.length ? `: ${outside.map((a) => a.id).join(", ")}` : ""}.
            </li>
            <li>
              {areaNoApplicants.length} area(s) have no applicants{areaNoApplicants.length ? `: ${areaNoApplicants.map((t) => t.territory.id).join(", ")}` : ""}.
            </li>
          </ul>
        </Card>
      </div>

      <SectionTitle>What we found</SectionTitle>
      {issues.length === 0 ? (
        <Card className="p-5">Every application is complete and consistent.</Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
            <button className="min-h-[44px] rounded-full border px-4 font-semibold" aria-pressed={kind === "all"} style={{ background: kind === "all" ? "#e8efff" : "#fff", borderColor: kind === "all" ? "#1f4fd8" : "#cdd6e6" }} onClick={() => setKind("all")}>
              All ({issues.length})
            </button>
            {counts.map(([k, n]) => (
              <button key={k} className="min-h-[44px] rounded-full border px-4 font-semibold" aria-pressed={kind === k} style={{ background: kind === k ? "#e8efff" : "#fff", borderColor: kind === k ? "#1f4fd8" : "#cdd6e6" }} onClick={() => setKind(k)}>
                {KIND_LABEL[k]} ({n})
              </button>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <table className="desk-table">
              <caption className="sr-only">Things found in the file, by applicant</caption>
              <thead>
                <tr>
                  <th scope="col">Decision</th>
                  <th scope="col">Applicant</th>
                  <th scope="col">Kind</th>
                  <th scope="col">What we found</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i, n) => (
                  <tr key={n} className={`row-${result.decisions[i.id].status}`}>
                    <td>
                      <StatusStamp status={result.decisions[i.id].status} flat />
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/applications/${i.id}`} className="mono font-bold">
                        {i.id}
                      </Link>{" "}
                      {i.name}
                    </td>
                    <td className="whitespace-nowrap">{KIND_LABEL[i.kind]}</td>
                    <td className="min-w-[300px]">{i.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
