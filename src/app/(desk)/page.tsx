"use client";

import Link from "next/link";
import { useDesk } from "@/lib/desk";
import { stagesFor, stageWindow } from "@/engine/plans";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ErrorBanner, ImportButton, Loading, PageHeader, SectionTitle, StatusStamp } from "@/components/ui";

const ORDER: Status[] = ["approved", "conditional", "needs_info", "waiting", "not_eligible"];

export default function Overview() {
  const { ready, hasData, result, ws, now } = useDesk();
  if (!ready) return <Loading />;
  if (!hasData)
    return (
      <>
        <PageHeader title="Overview" intro="See what needs attention today across every partner application." />
        <EmptyState
          title="No applications yet"
          text="Import a spreadsheet of partner applications and the areas you want to grow in. You'll see a decision and a reason for every applicant."
          action={<ImportButton />}
        />
      </>
    );

  const decisions = Object.values(result.decisions);
  const count = (s: Status) => decisions.filter((d) => d.status === s).length;
  const suggestions = decisions.filter((d) => d.suggestions.length > 0);
  const thin = result.territories.filter((t) => t.territory.slots > t.applicants.length);
  const overdue: { id: string; stage: string }[] = [];
  for (const d of decisions) {
    if (d.status !== "approved" && d.status !== "conditional") continue;
    const on = ws.approvedOn[d.id];
    if (!on) continue;
    const withZero = d.condition.some((c) => c.kind === "space");
    for (const st of stagesFor(d)) {
      const state = ws.stages[d.id]?.[st.key] ?? "Not started";
      if (state !== "Done" && stageWindow(new Date(on), st, withZero && st.n !== 0).end < now) {
        overdue.push({ id: d.id, stage: st.name });
        break;
      }
    }
  }

  const attention: { text: string; href: string }[] = [];
  if (count("needs_info")) attention.push({ text: `${count("needs_info")} application(s) need a reply from the applicant.`, href: "/applications?status=needs_info" });
  if (suggestions.length) attention.push({ text: `${suggestions.length} application(s) have notes with new facts to confirm, such as a shop found.`, href: "/applications" });
  if (count("conditional")) attention.push({ text: `${count("conditional")} approved with a condition. Their openings are held for 30 days.`, href: "/applications?status=conditional" });
  if (overdue.length) attention.push({ text: `${overdue.length} applicant(s) have a stage that is overdue.`, href: "/applications?status=approved" });
  if (count("waiting")) attention.push({ text: `${count("waiting")} applicant(s) are on the waiting list.`, href: "/applications?status=waiting" });
  if (thin.length) attention.push({ text: `${thin.length} area(s) have fewer applicants than openings: ${thin.map((t) => t.territory.id).join(", ")}.`, href: "/areas" });

  return (
    <>
      <PageHeader title="Overview" intro={`${decisions.length} applications from ${ws.fileName ?? "your import"}. Here is where things stand.`} action={<ImportButton label="Import more" />} />
      {result.problems.length > 0 && <ErrorBanner>We found a problem in the results and have not shown them. Please import the file again or contact support.</ErrorBanner>}
      <section aria-label="Totals" className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-5">
        {ORDER.map((s) => (
          <Link key={s} href={`/applications?status=${s}`} className="card card-link p-4">
            <div className="font-display-up text-[64px] leading-none" style={{ color: "var(--orange)" }}>
              {count(s)}
            </div>
            <div className="mt-2">
              <StatusStamp status={s} flat />
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle>What needs attention today</SectionTitle>
          {attention.length === 0 ? (
            <Card className="p-5">Nothing needs attention right now.</Card>
          ) : (
            <ul className="space-y-3">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="card card-link flex items-center justify-between gap-3 p-4 font-semibold no-underline">
                    <span>{a.text}</span>
                    <span aria-hidden="true" className="font-display-up text-2xl">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionTitle>Start with these</SectionTitle>
          {result.shortlist.length === 0 ? (
            <Card className="p-5">Nobody is approved yet.</Card>
          ) : (
            <Card className="divide-y divide-soft-line">
              {result.shortlist.slice(0, 3).map((s, i) => {
                const a = ws.applications.find((x) => x.id === s.id);
                return (
                  <Link key={s.id} href={`/applications/${s.id}`} className="flex items-center gap-4 p-4 text-ink no-underline hover:bg-lime/40">
                    <span className="font-display-up text-[44px] leading-none">{i + 1}</span>
                    <span>
                      <strong>{a?.name || s.id}</strong>
                      <br />
                      <span className="text-sm text-muted">
                        {a?.city} · {STATUS_LABEL[result.decisions[s.id].status]}
                      </span>
                    </span>
                  </Link>
                );
              })}
              <Link href="/shortlist" className="block p-4 font-semibold">
                See all five
              </Link>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
