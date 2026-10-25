"use client";

import Link from "next/link";
import { useDesk } from "@/lib/desk";
import { Bar, Card, EmptyState, ImportButton, Loading, PageHeader, StatusStamp } from "@/components/ui";

export default function Areas() {
  const { ready, hasData, ws, result } = useDesk();
  if (!ready) return <Loading />;
  if (!hasData || ws.territories.length === 0)
    return (
      <>
        <PageHeader title="Areas" intro="Each area we want to grow in: its openings, who got one, and who is waiting." />
        <EmptyState title="No areas yet" text="Import a spreadsheet that has a Territories sheet to see your areas here." action={<ImportButton />} />
      </>
    );
  const name = (id: string) => ws.applications.find((a) => a.id === id)?.name || "Name not provided";
  return (
    <>
      <PageHeader title="Areas" intro="Each area we want to grow in: its openings, who got one, and who is waiting." />
      <div className="grid gap-6 md:grid-cols-2">
        {result.territories.map((r) => {
          const t = r.territory;
          const used = r.approved.length;
          return (
            <Card key={t.id} className="p-5" selected={t.slots > 0 && r.openingsLeft === 0}>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display-up text-[34px] leading-none">
                    {t.id} · {t.city}
                  </h2>
                  <p className="text-sm text-muted">
                    Tier {t.tier} · {t.priority} priority · {t.pins.length} pin codes
                  </p>
                </div>
                <span className="font-display-up text-[40px] leading-none" style={{ color: "var(--orange)" }}>
                  {used}/{t.slots}
                </span>
              </div>
              <div className="my-3">
                <Bar value={used} max={t.slots} label={`${used} of ${t.slots} openings used`} />
                <p className="mt-1 text-sm">
                  {t.slots === 0 ? "No openings in this area at the moment." : r.openingsLeft === 0 ? "Full." : `${r.openingsLeft} opening(s) left.`} {r.applicants.length} applicant(s) in this area.
                </p>
              </div>
              {r.approved.length > 0 && (
                <>
                  <h3 className="font-display-up text-[20px]">Got an opening</h3>
                  <ul className="mb-3 space-y-1">
                    {r.approved.map((id) => (
                      <li key={id} className="flex flex-wrap items-center gap-2">
                        <StatusStamp status={result.decisions[id].status} flat />
                        <Link href={`/applications/${id}`}>{id}</Link> {name(id)} · pin <span className="mono">{ws.applications.find((a) => a.id === id)?.pin}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {r.waiting.length > 0 && (
                <>
                  <h3 className="font-display-up text-[20px]">Waiting list</h3>
                  <ol className="mb-3 list-decimal space-y-1 pl-5">
                    {r.waiting.map((id) => (
                      <li key={id}>
                        <Link href={`/applications/${id}`}>{id}</Link> {name(id)}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <h3 className="font-display-up text-[20px]">Free pin codes</h3>
              <p className="mono text-sm">{r.freePins.length ? r.freePins.join(", ") : "None. Every pin code here has a store or an approved partner."}</p>
            </Card>
          );
        })}
      </div>
    </>
  );
}
