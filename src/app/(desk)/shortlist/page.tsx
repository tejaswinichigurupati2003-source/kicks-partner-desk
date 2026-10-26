"use client";

import Link from "next/link";
import { useDesk } from "@/lib/desk";
import { CONFIG } from "@/engine/config";
import { EmptyState, ImportButton, Loading, PageHeader, ScoreTag, StatusStamp } from "@/components/ui";

export default function Shortlist() {
  const { ready, hasData, ws, result } = useDesk();
  if (!ready) return <Loading />;
  const intro = "The five approved applicants to get moving first. Ordered by score, with a bonus when the area is a priority.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Start here" intro={intro} />
        <EmptyState title="Nothing to start with yet" text="Import applications and the five best approved ones will appear here." action={<ImportButton />} />
      </>
    );
  if (result.shortlist.length === 0)
    return (
      <>
        <PageHeader title="Start here" intro={intro} />
        <EmptyState title="Nobody is approved yet" text="When applicants are approved, the first five to start with will appear here." action={<Link className="btn" href="/applications">See applications</Link>} />
      </>
    );
  return (
    <>
      <PageHeader title="Start here" intro={intro} />
      <ol className="space-y-4">
        {result.shortlist.map((s, i) => {
          const a = ws.applications.find((x) => x.id === s.id)!;
          const d = result.decisions[s.id];
          const t = ws.territories.find((x) => x.id === d.territoryId);
          const bonus = t ? CONFIG.priorityBonus[t.priority] : 0;
          return (
            <li key={s.id}>
              <Link href={`/applications/${s.id}`} className="card card-link flex flex-wrap items-center gap-5 p-4 no-underline">
                <span className="big-num w-20 text-center text-[96px] leading-[0.85]" style={{ background: "var(--lime)", border: "2px solid var(--ink)", borderRadius: 6 }}>
                  {i + 1}
                </span>
                <span className="min-w-[220px] flex-1">
                  <strong className="text-[20px]">{a.name || "Name not provided"}</strong>
                  <br />
                  <span className="text-muted">
                    {a.id} · {a.city} · pin <span className="mono">{a.pin}</span> · {d.territoryId} ({t?.priority} priority)
                  </span>
                  <br />
                  <span className="text-sm">
                    Score {d.score} {bonus ? `+ ${bonus} for a ${t?.priority.toLowerCase()}-priority area ` : ""}= {s.value}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-2">
                  <StatusStamp status={d.status} flat />
                  <ScoreTag score={d.score} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
