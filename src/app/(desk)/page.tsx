"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { useAlerts } from "@/lib/alerts";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ErrorBanner, ImportButton, Loading, PageHeader, StatusStamp } from "@/components/ui";

const ORDER: Status[] = ["approved", "conditional", "redirected", "waiting", "needs_info", "not_in_plan", "not_eligible", "withdrawn"];
const COLOR: Record<Status, string> = { approved: "#16a34a", conditional: "#b45309", redirected: "#0f766e", waiting: "#2563eb", needs_info: "#4b5563", not_in_plan: "#57534e", not_eligible: "#dc2626", withdrawn: "#44403c" };
const HINT: Record<Status, string> = {
  approved: "Got an opening",
  conditional: "Opening held",
  redirected: "Offered another pin",
  waiting: "Waiting for an opening",
  needs_info: "Waiting on a reply",
  not_in_plan: "Outside the plan",
  not_eligible: "Rule not met",
  withdrawn: "Left the process",
};

interface EventLine {
  id: number;
  group_id: string;
  application_id: string | null;
  trigger: string;
  actor: string;
  summary: string;
  at: string;
}

// Approximate positions (longitude, latitude) of our cities, for the schematic map.
const POS: Record<string, [number, number]> = {
  Bengaluru: [77.59, 12.97],
  Mysuru: [76.64, 12.3],
  Mangaluru: [74.86, 12.91],
  "Hubballi-Dharwad": [75.12, 15.36],
  Belagavi: [74.5, 15.85],
  Tumakuru: [77.1, 13.34],
  Davanagere: [75.92, 14.47],
};
const OUTLINE: [number, number][] = [
  [74.1, 12.8], [74.4, 14.8], [74.1, 15.0], [74.6, 15.9], [74.3, 17.4], [75.9, 17.9], [77.3, 18.4], [78.4, 17.3], [77.6, 16.0],
  [77.5, 15.2], [77.8, 14.2], [78.3, 13.6], [78.3, 12.7], [77.6, 11.7], [76.5, 11.6], [75.8, 11.9], [75.2, 12.2],
];
const W = 360;
const H = 330;
const px = (lon: number) => ((lon - 73.8) / (78.8 - 73.8)) * (W - 40) + 20;
const py = (lat: number) => H - 20 - ((lat - 11.4) / (18.6 - 11.4)) * (H - 40);

export default function Overview() {
  const { ready, hasData, result, ws } = useDesk();
  const { alerts } = useAlerts();
  const [city, setCity] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLine[]>([]);
  const runKey = useDesk().runId;
  useEffect(() => {
    if (!runKey) return;
    let off = false;
    fetch("/api/run/events?limit=40", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { events?: EventLine[] }) => {
        if (off) return;
        const seen = new Set<string>();
        const heads = (j.events ?? []).filter((e) => e.application_id === null && !seen.has(e.group_id) && seen.add(e.group_id));
        setEvents(heads.slice(0, 6));
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [runKey, ws.applications.length]);

  const cities = useMemo(() => {
    const names = Array.from(new Set([...ws.territories.map((t) => t.city), ...ws.stores.map((s) => s.city), ...ws.applications.map((a) => a.city)])).filter((c) => POS[c]);
    return names.map((name) => {
      const terrs = result.territories.filter((t) => t.territory.city === name);
      const slots = terrs.reduce((n, t) => n + t.territory.slots, 0);
      const left = terrs.reduce((n, t) => n + t.openingsLeft, 0);
      const apps = ws.applications.filter((a) => a.city === name);
      const by = (s: Status) => apps.filter((a) => result.decisions[a.id]?.status === s).length;
      const state = slots === 0 ? "none" : left === 0 ? "full" : left < slots ? "filling" : "open";
      return { name, slots, left, applicants: apps.length, stores: ws.stores.filter((s) => s.city === name).length, by, state };
    });
  }, [ws, result]);

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
  const total = decisions.length;
  const count = (s: Status) => decisions.filter((d) => d.status === s).length;
  const picked = cities.find((c) => c.name === city) ?? null;
  const stateColor = (s: string) => (s === "full" ? "#dc2626" : s === "filling" ? "#d97706" : s === "open" ? "#16a34a" : "#9aa3b5");
  const recent = events;

  return (
    <>
      {result.problems.length > 0 && <ErrorBanner>We found a problem in the results and have not shown them. Please import the file again.</ErrorBanner>}

      <section aria-label="Totals" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {ORDER.map((s) => (
          <Link key={s} href={`/applications?status=${s}`} className="card card-link p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[14px] font-semibold text-muted">{STATUS_LABEL[s]}</span>
              <span className={`dot dot-${s} mt-1.5`} aria-hidden="true" />
            </div>
            <div className="big-num mt-2 text-[56px] leading-none" style={{ color: COLOR[s] }}>
              {count(s)}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-soft-line pt-2 text-xs text-muted">
              <span>{HINT[s]}</span>
              <span className="mono font-bold" style={{ color: COLOR[s] }}>
                {total ? Math.round((count(s) / total) * 100) : 0}%
              </span>
            </div>
          </Link>
        ))}
      </section>

      <div className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display-up text-[18px] leading-tight">Areas overview</h2>
            <Link href="/areas" className="text-sm font-semibold">
              See all areas
            </Link>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,250px)]">
            <div className="rounded-xl border border-soft-line bg-[#f4f8ff] p-2">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schematic map of Karnataka with our cities" className="w-full">
                <polygon points={OUTLINE.map(([lo, la]) => `${px(lo)},${py(la)}`).join(" ")} fill="#e3ecfb" stroke="#b9c9e8" strokeWidth="2" strokeLinejoin="round" />
                {cities.map((c) => {
                  const [lo, la] = POS[c.name];
                  const x = px(lo);
                  const y = py(la);
                  const r = 9 + Math.min(c.slots, 6) * 1.6;
                  const sel = picked?.name === c.name;
                  return (
                    <g key={c.name} tabIndex={0} role="button" aria-label={`${c.name}: ${c.left} of ${c.slots} openings left`} onClick={() => setCity(c.name)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCity(c.name)} style={{ cursor: "pointer" }}>
                      <circle cx={x} cy={y} r={r + 7} fill={stateColor(c.state)} opacity={sel ? 0.28 : 0.14} />
                      <circle cx={x} cy={y} r={r} fill={stateColor(c.state)} stroke="#fff" strokeWidth="3" />
                      <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                        {c.left}
                      </text>
                      <text x={c.name === "Tumakuru" ? x - r - 6 : x + r + 6} y={c.name === "Tumakuru" ? y - 2 : y + 4} textAnchor={c.name === "Tumakuru" ? "end" : "start"} fontSize="11" fontWeight="600" fill="#1f2937">
                        {c.name.replace("-Dharwad", "")}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="px-2 pb-1 text-[11px] text-muted">Schematic, not to scale. The number is openings left.</p>
            </div>
            <div className="flex flex-col gap-3">
              {picked ? (
                <div className="rounded-xl border border-soft-line p-4">
                  <p className="text-lg font-bold leading-snug">{picked.name}</p>
                  <dl className="mt-3 divide-y divide-soft-line text-sm">
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-muted">Existing stores</dt>
                      <dd className="mono whitespace-nowrap font-bold">{picked.stores}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-muted">Openings left</dt>
                      <dd className="mono whitespace-nowrap font-bold">
                        {picked.left} of {picked.slots}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-muted">Applicants</dt>
                      <dd className="mono whitespace-nowrap font-bold">{picked.applicants}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ORDER.filter((s) => picked.by(s) > 0).map((s) => (
                      <span key={s} className={`stamp stamp-flat s-${s} max-w-full !whitespace-normal`}>
                        {picked.by(s)} {STATUS_LABEL[s]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-soft-line p-4 text-sm text-muted">Select a city on the map to see its openings and applicants.</p>
              )}
              <ul className="space-y-1.5 text-sm">
                {[
                  ["#16a34a", "Openings available"],
                  ["#d97706", "Filling up"],
                  ["#dc2626", "Full"],
                  ["#9aa3b5", "No openings"],
                ].map(([c, l]) => (
                  <li key={l} className="flex items-center gap-2">
                    <span className="dot" style={{ background: c }} aria-hidden="true" />
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display-up mb-3 text-[18px] leading-tight">Alerts</h2>
          {alerts.length === 0 ? (
            <p className="rounded-xl border border-soft-line p-4">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className={`card-link block rounded-xl border p-3 no-underline tint-${a.tone}`}>
                    <span className="flex items-center gap-2 font-bold">
                      <span className={`dot dot-${a.tone}`} aria-hidden="true" />
                      {a.title}
                    </span>
                    <span className="mt-1 block text-sm text-[#3b4558]">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display-up text-[18px] leading-tight">Start with these</h2>
            <Link href="/shortlist" className="text-sm font-semibold">
              See all five
            </Link>
          </div>
          {result.shortlist.length === 0 ? (
            <p className="text-muted">Nobody is approved yet.</p>
          ) : (
            <ol className="space-y-2">
              {result.shortlist.slice(0, 3).map((s, i) => {
                const a = ws.applications.find((x) => x.id === s.id);
                const d = result.decisions[s.id];
                return (
                  <li key={s.id}>
                    <Link href={`/applications/${s.id}`} className={`flex items-center gap-4 rounded-xl border p-3 no-underline tint-${d.status}`} style={{ color: "inherit" }}>
                      <span className="big-num text-[40px] leading-none" style={{ color: COLOR[d.status] }}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate">{a?.name || s.id}</strong>
                        <span className="text-sm text-muted">
                          {a?.city} · {d.territoryId}
                        </span>
                      </span>
                      <StatusStamp status={d.status} flat />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display-up mb-3 text-[18px] leading-tight">Recent activity</h2>
          {recent.length === 0 ? (
            <p className="text-muted">Imports, chat updates, assumption changes and manual decisions show up here as the team works.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((l) => (
                <li key={l.group_id} className="flex gap-3 rounded-xl border border-soft-line p-3">
                  <span className="dot mt-1.5" style={{ background: l.trigger === "override" ? "#b45309" : l.trigger === "chat" ? "#2563eb" : l.trigger === "assumption" ? "#0f766e" : "#16a34a" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm">
                    {l.summary}
                    <span className="mt-0.5 block text-xs text-muted">{l.actor} · {new Date(l.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
