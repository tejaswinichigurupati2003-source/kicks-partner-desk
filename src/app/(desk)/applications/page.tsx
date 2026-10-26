"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, ErrorBanner, ImportButton, Loading, PageHeader, ScoreTag, StatusStamp } from "@/components/ui";

const STATUSES: Status[] = ["approved", "conditional", "redirected", "waiting", "needs_info", "not_in_plan", "not_eligible", "withdrawn"];

function List() {
  const { ready, hasData, ws, result } = useDesk();
  const params = useSearchParams();
  const initial = params.get("status");
  const [status, setStatus] = useState<string>(initial && (STATUSES as string[]).includes(initial) ? initial : "all");
  const [area, setArea] = useState("all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ws.applications.length };
    for (const s of STATUSES) c[s] = 0;
    for (const a of ws.applications) {
      const d = result.decisions[a.id];
      if (d) c[d.status] = (c[d.status] ?? 0) + 1;
    }
    return c;
  }, [ws.applications, result]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ws.applications.filter((a) => {
      const d = result.decisions[a.id];
      if (!d) return false;
      if (status !== "all" && d.status !== status) return false;
      if (area !== "all" && d.territoryId !== area) return false;
      if (needle && !`${a.id} ${a.name} ${a.city} ${a.pin} ${d.assignedPin ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ws.applications, result, status, area, q]);

  if (!ready) return <Loading />;
  const intro = "Every applicant, with a decision and a reason. Open one to see the next steps.";
  if (!hasData)
    return (
      <>
        <PageHeader title="Applications" intro={intro} />
        <EmptyState title="No applications yet" text="Import a spreadsheet to see your applicants here." action={<ImportButton />} />
      </>
    );

  async function download() {
    setBusy(true);
    try {
      const header = ["Application ID", "Name", "City", "Requested pin code", "Decision", "Assigned pin code", "Score", "Area", "Reason", "Next step"];
      const out = ws.applications.map((a) => {
        const d = result.decisions[a.id];
        return [a.id, a.name, a.city, a.pin, STATUS_LABEL[d.status], d.assignedPin ?? "", d.score, d.territoryId ?? "", d.verdict, d.nextStep];
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
        intro={intro}
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
              className="min-h-[44px] rounded-full border px-4 font-semibold"
              style={{ background: status === s ? "#e8efff" : "#fff", borderColor: status === s ? "#1f4fd8" : "#cdd6e6" }}
            >
              {s !== "all" && <span className={`dot dot-${s} mr-2`} aria-hidden="true" />}
              {s === "all" ? "All" : STATUS_LABEL[s as Status]} ({counts[s] ?? 0})
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
            <caption className="sr-only">Applications with their decision, pin code and reason</caption>
            <thead>
              <tr>
                <th scope="col">Decision</th>
                <th scope="col">Number</th>
                <th scope="col">Name</th>
                <th scope="col">City · pin asked</th>
                <th scope="col">Pin given</th>
                <th scope="col">Area</th>
                <th scope="col">Score</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const d = result.decisions[a.id];
                return (
                  <tr key={a.id} className={`row-${d.status}`}>
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
                    <td className="mono whitespace-nowrap">{d.assignedPin ?? "—"}</td>
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
