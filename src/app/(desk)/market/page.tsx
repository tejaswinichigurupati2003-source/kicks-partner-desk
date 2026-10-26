"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDesk } from "@/lib/desk";
import { CONFIG } from "@/engine/config";
import { earnBackMonths } from "@/engine/run";
import { Card, EmptyState, ImportButton, Loading, PageHeader, SectionTitle } from "@/components/ui";

interface Notes {
  ok: boolean;
  reason?: string;
  points?: { text: string; sources: { title: string; url: string }[] }[];
  sources?: { title: string; url: string; date: string | null }[];
  asOf?: string;
}

export default function Market() {
  const { ready, hasData, ws, result } = useDesk();
  const [notes, setNotes] = useState<Record<string, Notes | "loading">>({});

  const cities = useMemo(() => {
    const names = Array.from(new Set([...ws.territories.map((t) => t.city), ...ws.applications.map((a) => a.city), ...ws.stores.map((s) => s.city)])).filter((c) => CONFIG.cities[c]);
    return names.map((city) => {
      const apps = ws.applications.filter((a) => a.city === city);
      const decisions = apps.map((a) => result.decisions[a.id]).filter(Boolean);
      const terrs = result.territories.filter((t) => t.territory.city === city);
      const withSpace = decisions.filter((d) => d.hasSpace).length;
      const scored = decisions.filter((d) => d.score !== null);
      const invested = apps.filter((a) => a.investment !== null);
      const tier = CONFIG.cities[city].tier;
      return {
        city,
        tier,
        stores: ws.stores.filter((s) => s.city === city).length,
        openings: terrs.reduce((n, t) => n + t.territory.slots, 0),
        left: terrs.reduce((n, t) => n + t.openingsLeft, 0),
        applicants: apps.length,
        approved: decisions.filter((d) => d.status === "approved" || d.status === "conditional").length,
        waiting: decisions.filter((d) => d.status === "waiting").length,
        space: apps.length ? Math.round((withSpace / apps.length) * 100) : null,
        avgScore: scored.length ? Math.round(scored.reduce((n, d) => n + (d.score ?? 0), 0) / scored.length) : null,
        avgInvest: invested.length ? Math.round((invested.reduce((n, a) => n + (a.investment ?? 0), 0) / invested.length) * 10) / 10 : null,
        free: terrs.reduce((n, t) => n + t.freePins.length, 0),
        rented: Math.round(earnBackMonths(tier, "Rented")),
        owned: Math.round(earnBackMonths(tier, "Owned")),
      };
    });
  }, [ws, result]);

  async function load(city: string) {
    setNotes((n) => ({ ...n, [city]: "loading" }));
    try {
      const res = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city }) });
      const data = (await res.json()) as Notes;
      setNotes((n) => ({ ...n, [city]: data }));
    } catch {
      setNotes((n) => ({ ...n, [city]: { ok: false, reason: "error" } }));
    }
  }

  if (!ready) return <Loading />;
  const intro = "How each city looks from your own applications and areas, and live market notes from the web. Use it to decide where to push for more partners.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Market intelligence" intro={intro} />
        <EmptyState title="No market view yet" text="Import applications and areas to see demand, readiness and gaps by city." action={<ImportButton />} />
      </>
    );

  const gaps = cities.filter((c) => c.openings > c.applicants);
  const hot = cities.filter((c) => c.applicants > c.openings && c.openings > 0);

  return (
    <>
      <PageHeader
        title="Market intelligence"
        intro={intro}
        action={
          <Link className="btn btn-ghost" href="/stores">
            Our stores
          </Link>
        }
      />

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Where we need more partners</SectionTitle>
          {gaps.length === 0 ? (
            <p>Every city has at least as many applicants as openings.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {gaps.map((c) => (
                <li key={c.city}>
                  <strong>{c.city}</strong>: {c.applicants} applicant(s) for {c.openings} openings.
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle>Where demand is strongest</SectionTitle>
          {hot.length === 0 ? (
            <p>No city has more applicants than openings.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              {hot.map((c) => (
                <li key={c.city}>
                  <strong>{c.city}</strong>: {c.applicants} applicant(s) for {c.openings} openings. {c.waiting} on the waiting list.
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SectionTitle>City by city</SectionTitle>
      <Card className="mb-3 overflow-x-auto">
        <table className="desk-table">
          <thead>
            <tr>
              <th>City</th>
              <th>Stores</th>
              <th>Openings (left)</th>
              <th>Applicants</th>
              <th>Approved</th>
              <th>With a shop space</th>
              <th>Average score</th>
              <th>Average investment</th>
              <th>Free pin codes</th>
              <th>Months to earn back</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.city}>
                <td className="whitespace-nowrap font-bold">
                  {c.city} <span className="text-sm font-normal text-muted">Tier {c.tier}</span>
                </td>
                <td className="mono">{c.stores}</td>
                <td className="mono">
                  {c.openings} ({c.left})
                </td>
                <td className="mono">{c.applicants}</td>
                <td className="mono">{c.approved}</td>
                <td className="mono">{c.space === null ? "—" : `${c.space}%`}</td>
                <td className="mono">{c.avgScore ?? "—"}</td>
                <td className="mono">{c.avgInvest === null ? "—" : `₹${c.avgInvest} lakh`}</td>
                <td className="mono">{c.free}</td>
                <td className="mono whitespace-nowrap">
                  {c.rented} rented · {c.owned} owned
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mb-8 text-sm text-muted">Setup cost is ₹35 lakh in Tier 1, ₹25 lakh in Tier 2 and ₹18 lakh in Tier 3. Our target is to earn it back in 30 months or less.</p>

      <SectionTitle>Live market notes</SectionTitle>
      <p className="mb-4 max-w-2xl text-muted">Recent web coverage on footwear demand, shop rents and competition in each city, with the sources. Notes are a starting point for the team, not a rule: they never change a decision.</p>
      <div className="grid gap-6 md:grid-cols-2">
        {cities.map((c) => {
          const n = notes[c.city];
          const loaded: Notes | null = n && n !== "loading" ? n : null;
          return (
            <Card key={c.city} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display-up text-[28px] leading-none">{c.city}</h3>
                <button className="btn btn-ghost btn-small" disabled={n === "loading"} onClick={() => load(c.city)}>
                  {n === "loading" ? "Looking…" : loaded?.ok ? "Refresh notes" : "Get market notes"}
                </button>
              </div>
              {loaded && !loaded.ok && (
                <p className="mt-3 text-muted">
                  {loaded?.reason === "off"
                    ? "Live market notes aren't switched on yet."
                    : loaded?.reason === "busy"
                      ? "Too many requests. Please try again in a minute."
                      : loaded?.reason === "none"
                        ? "We couldn't find recent coverage for this city."
                        : "We couldn't get market notes just now. Please try again."}
                </p>
              )}
              {loaded && loaded.ok && (
                <div className="mt-3 space-y-3">
                  {loaded?.points && loaded.points.length > 0 ? (
                    <ul className="space-y-3">
                      {loaded.points.map((p, i) => (
                        <li key={i}>
                          {p.text}
                          <br />
                          <span className="text-sm">
                            {p.sources.map((s, j) => (
                              <a key={j} href={s.url} target="_blank" rel="noreferrer" className="mr-3">
                                {s.title.slice(0, 40)}
                              </a>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5">
                      {(loaded?.sources ?? []).slice(0, 5).map((s, i) => (
                        <li key={i}>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-sm text-muted">As of {loaded?.asOf}. Check the sources before relying on a figure.</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
