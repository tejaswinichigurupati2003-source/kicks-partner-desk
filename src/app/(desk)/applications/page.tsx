"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ErrorBanner, ImportButton, Loading, PageHeader, ScoreTag, StatusStamp } from "@/components/ui";

const STATUSES = Object.keys(STATUS_LABEL) as Status[];

function List() {
  const { ready, hasData, ws, result } = useDesk();
  const params = useSearchParams();
  const [status, setStatus] = useState<string>(params.get("status") ?? "all");
  const [area, setArea] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ws.applications.filter((a) => {
      const d = result.decisions[a.id];
      if (!d) return false;
      if (status !== "all" && d.status !== status) return false;
      if (area !== "all" && d.territoryId !== area) return false;
      if (needle && !`${a.id} ${a.name} ${a.city} ${a.pin}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ws.applications, result, status, area, q]);

  if (!ready) return <Loading />;
  if (!hasData)
    return (
      <>
        <PageHeader title="Applications" intro="Every applicant, with a decision and a reason." />
        <EmptyState title="No applications yet" text="Import a spreadsheet to see your applicants here." action={<ImportButton />} />
      </>
    );

  async function download() {
    setBusy(true);
    try {
      const header = ["Application ID", "Name", "City", "Pin code", "Decision", "Score", "Area", "Reason", "Condition or question"];
      const out = ws.applications.map((a) => {
        const d = result.decisions[a.id];
        return [a.id, a.name, a.city, a.pin, STATUS_LABEL[d.status], d.score, d.territoryId ?? "", d.verdict, d.ask ?? d.condition.map((c) => c.text).join(" ")];
      });
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ header, rows: out }) });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kicks-partner-decisions.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("We couldn't create the file. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Applications"
        intro="Every applicant, with a decision and a reason. Open one to see the next steps."
        action={
          <button className="btn btn-ghost" onClick={download} disabled={busy}>
            {busy ? "Preparing…" : "Download results"}
          </button>
        }
      />
      {result.problems.length > 0 && <ErrorBanner>We found a problem in the results and have not shown them.</ErrorBanner>}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by decision">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className="min-h-[44px] rounded-md border-2 border-ink px-3 font-bold"
              style={{ background: status === s ? "var(--lime)" : "var(--surface)" }}
            >
              {s === "all" ? "All" : STATUS_LABEL[s as Status]} ({s === "all" ? ws.applications.length : ws.applications.filter((a) => result.decisions[a.id]?.status === s).length})
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="area">
            Area
          </label>
          <select id="area" className="field" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">All areas</option>
            {ws.territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.city}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="search">
            Search
          </label>
          <input id="search" className="field" placeholder="Name, number, city or pin code" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6">No applications match. Try clearing a filter.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Number</th>
                <th>Name</th>
                <th>City · pin</th>
                <th>Area</th>
                <th>Score</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const d = result.decisions[a.id];
                return (
                  <tr key={a.id}>
                    <td>
                      <StatusStamp status={d.status} flat />
                    </td>
                    <td className="mono whitespace-nowrap">
                      <Link href={`/applications/${a.id}`}>{a.id}</Link>
                    </td>
                    <td className="whitespace-nowrap">{a.name || "Not provided"}</td>
                    <td className="whitespace-nowrap">
                      {a.city} · <span className="mono">{a.pin || "—"}</span>
                    </td>
                    <td className="mono">{d.territoryId ?? "—"}</td>
                    <td>
                      <ScoreTag score={d.score} />
                    </td>
                    <td className="min-w-[280px] max-w-[420px]">{d.verdict}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

export default function Applications() {
  return (
    <Suspense fallback={<Loading />}>
      <List />
    </Suspense>
  );
}
