"use client";

import Link from "next/link";
import { useDesk } from "@/lib/desk";
import { HOLDS_OPENING, STATUS_LABEL } from "@/engine/run";
import type { PinState } from "@/engine/types";
import { Bar, Card, EmptyState, ImportButton, Loading, PageHeader, StatusStamp } from "@/components/ui";

const STATE: Record<PinState, { label: string; mark: string; box: string; text: string }> = {
  store: { label: "Existing store", mark: "■", box: "#e7e5e4", text: "#292524" },
  allocated: { label: "Allocated", mark: "✓", box: "#d9f5e5", text: "#0e6b43" },
  redirected: { label: "Redirected-to", mark: "↪", box: "#d6f3ef", text: "#0b5d56" },
  contested: { label: "Contested", mark: "⚑", box: "#fff0c2", text: "#7a4a00" },
  free: { label: "Free", mark: "○", box: "#ffffff", text: "#3b4558" },
};

export default function Areas() {
  const { ready, hasData, ws, result } = useDesk();
  if (!ready) return <Loading />;
  const intro = "Each area we want to grow in: every pin code and who has it, the openings used, and who is waiting.";
  if (!hasData || ws.territories.length === 0)
    return (
      <>
        <PageHeader title="Areas" intro={intro} />
        <EmptyState title="No areas yet" text="Import a spreadsheet that has a Territories sheet to see your areas here." action={<ImportButton />} />
      </>
    );
  const name = (id: string) => ws.applications.find((a) => a.id === id)?.name || "Name not provided";

  return (
    <>
      <PageHeader title="Areas" intro={intro} />

      <Card className="mb-6 p-4">
        <p className="mb-2 font-bold">How to read the pin boxes</p>
        <ul className="flex flex-wrap gap-3 text-sm">
          {(Object.keys(STATE) as PinState[]).map((s) => (
            <li key={s} className="flex items-center gap-2 rounded-lg border border-[#cdd6e6] px-3 py-1.5" style={{ background: STATE[s].box, color: STATE[s].text }}>
              <span aria-hidden="true" className="font-bold">
                {STATE[s].mark}
              </span>
              {STATE[s].label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Each box also says its state in words. Contested means two or more applicants asked for that pin code.</p>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        {result.territories.map((r) => {
          const t = r.territory;
          const used = r.approved.length + r.redirected.length;
          return (
            <Card key={t.id} className="p-5" selected={t.slots > 0 && r.openingsLeft === 0}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display-up text-[20px] leading-tight">
                    {t.id} · {t.city}
                  </h2>
                  <p className="text-sm text-muted">
                    Tier {t.tier} · {t.priority} priority · {t.pins.length} pin codes
                  </p>
                </div>
                <p className="text-right">
                  <span className="big-num text-[40px] leading-none" style={{ color: "var(--orange)" }}>
                    {used}/{t.slots}
                  </span>
                  <span className="block text-xs text-muted">openings filled</span>
                </p>
              </div>
              <div className="my-3">
                <Bar value={used} max={t.slots} label={`${used} of ${t.slots} openings filled`} />
                <p className="mt-1 text-sm">
                  {t.slots === 0 ? "No openings in this area at the moment." : r.openingsLeft === 0 ? "Full." : `${r.openingsLeft} opening(s) left.`} {r.applicants.length} applicant(s) in the running.
                </p>
              </div>

              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`Pin codes in ${t.id}`}>
                {r.pins.map((p) => {
                  const st = STATE[p.state];
                  return (
                    <li key={p.pin} className="rounded-xl border p-2" style={{ background: st.box, color: st.text, borderColor: "#cdd6e6" }}>
                      <p className="mono font-bold">{p.pin}</p>
                      <p className="text-sm font-semibold">
                        <span aria-hidden="true">{st.mark} </span>
                        {st.label}
                      </p>
                      {p.by.length > 0 && (
                        <p className="text-xs">
                          {p.by.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ", "}
                              {p.state === "store" ? id : <Link href={`/applications/${id}`} className="mono font-bold" style={{ color: "inherit" }}>{id}</Link>}
                            </span>
                          ))}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {(r.approved.length > 0 || r.redirected.length > 0) && (
                <>
                  <h3 className="mt-4 font-bold">Got an opening</h3>
                  <ul className="mb-2 space-y-1">
                    {[...r.approved, ...r.redirected].map((id) => {
                      const d = result.decisions[id];
                      return (
                        <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                          <StatusStamp status={d.status} flat />
                          <Link href={`/applications/${id}`} className="mono font-bold">
                            {id}
                          </Link>{" "}
                          {name(id)} · pin <span className="mono">{d.assignedPin}</span>
                          {d.status === "redirected" && <span className="text-muted">(asked for {ws.applications.find((a) => a.id === id)?.pin})</span>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {r.waiting.length > 0 && (
                <>
                  <h3 className="mt-3 font-bold">Waiting list</h3>
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {r.waiting.map((id) => (
                      <li key={id}>
                        <Link href={`/applications/${id}`} className="mono font-bold">
                          {id}
                        </Link>{" "}
                        {name(id)}
                        {result.decisions[id] && HOLDS_OPENING.includes(result.decisions[id].status) ? ` (${STATUS_LABEL[result.decisions[id].status]})` : ""}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
