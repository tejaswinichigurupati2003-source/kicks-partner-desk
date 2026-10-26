"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useDesk } from "@/lib/desk";
import { Card, ErrorBanner, PageHeader, SectionTitle } from "@/components/ui";
import type { DataHealth } from "@/lib/workspace";

export default function ImportPage() {
  const desk = useDesk();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [drag, setDrag] = useState(false);
  const [fresh, setFresh] = useState<{ health: DataHealth; fileName: string } | null>(null);

  async function finish(p: Promise<{ ok: true; health: DataHealth } | { ok: false; error: string }>, fileName: string) {
    setBusy(true);
    setError(null);
    setFresh(null);
    const res = await p;
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) setError(res.error);
    else setFresh({ health: res.health, fileName });
  }

  const upload = (file: File) => finish(desk.importFile(file, mode), file.name);
  const practice = () => finish(desk.loadPractice(), "practice-applications.xlsx");

  // Show the report for what was just imported, or for the run that is open now.
  const health = fresh?.health ?? desk.ws.health;
  const fileName = fresh?.fileName ?? desk.ws.fileName;

  return (
    <>
      <PageHeader title="Import applications" intro="Bring in your applications and the areas you want to grow in from one Excel file. You'll get a decision and a reason for every applicant." />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {desk.localOnly && <ErrorBanner>Saving isn&apos;t available right now, so a file can&apos;t be added. Please try again in a moment.</ErrorBanner>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div
            className="card flex flex-col items-center gap-4 border-dashed px-6 py-12 text-center"
            style={{ background: drag ? "#e8efff" : undefined }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
          >
            <p className="font-display-up text-[22px] leading-tight">Drop your Excel file here</p>
            <p className="text-muted">or choose it from your computer. It needs the sheets Applications, Territories and Existing stores.</p>
            <label htmlFor="file" className="sr-only">
              Choose an Excel file
            </label>
            <input id="file" ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Reading your file…" : "Choose file"}
            </button>
            <fieldset className="mt-2 flex flex-wrap justify-center gap-6">
              <legend className="sr-only">What to do with the current list</legend>
              <label className="flex min-h-[44px] items-center gap-2 font-semibold">
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="h-5 w-5 accent-[#12306b]" />
                Start a new run
              </label>
              <label className="flex min-h-[44px] items-center gap-2 font-semibold">
                <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} className="h-5 w-5 accent-[#12306b]" />
                Add to this run
              </label>
            </fieldset>
            <p className="max-w-md text-sm text-muted">A new run gets its own private link. Adding keeps the current run and its link, and skips applications that are already in it.</p>
          </div>

          {health ? <HealthReport health={health} fileName={fileName} justNow={!!fresh} /> : (
            <Card className="p-5">
              <SectionTitle>Data health</SectionTitle>
              <p className="text-muted">After you import a file, this report shows how many rows were read, what was left blank, every value we changed while cleaning, and any errors, with row numbers.</p>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Need the spreadsheet?</SectionTitle>
            <p className="mb-4 text-muted">Download the blank file with the right sheets and headings, then fill in one row per applicant.</p>
            <a className="btn btn-ghost" href="/api/template" download>
              Download template
            </a>
          </Card>
          <Card className="p-5">
            <SectionTitle>Want to look around first?</SectionTitle>
            <p className="mb-4 text-muted">Start a new run with 24 practice applicants, 8 areas and our 10 stores. It never changes the run you are in now.</p>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void practice()}>
              Load practice data
            </button>
          </Card>
          <Card className="p-5">
            <SectionTitle>Your data</SectionTitle>
            <p className="text-muted">Files are read and not kept. Runs are kept for 7 days and then deleted.</p>
            {desk.hasData && (
              <Link href="/board" className="btn btn-small mt-4">
                See the decisions
              </Link>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function HealthReport({ health, fileName, justNow }: { health: DataHealth; fileName: string | null; justNow: boolean }) {
  const bySheet = new Map<string, DataHealth["errors"]>();
  for (const e of health.errors) bySheet.set(e.sheet, [...(bySheet.get(e.sheet) ?? []), e]);
  const sheetNames = ["Applications", "Territories", "Existing stores"];
  const clean = health.errors.length === 0;
  return (
    <Card className="p-5" selected={justNow}>
      <h2 className="font-display-up text-[22px] leading-tight">Data health</h2>
      <p className="mt-1 text-muted">
        {fileName ? <strong>{fileName}</strong> : "Your file"}
        {": "}
        {health.applicationRows} applications, {health.territoryRows} areas and {health.storeRows} existing stores were read.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        {health.sheets.map((s) => (
          <div key={s.name} className="rounded-xl border border-soft-line p-3">
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="big-num text-[36px] leading-none">{s.rows}</p>
            <p className="text-xs text-muted">{s.found ? "rows read" : "sheet not found, default list used"}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        <section aria-labelledby="h-example">
          <h3 id="h-example" className="font-bold">
            Example row
          </h3>
          <p className="text-sm">{health.exampleRowSkipped ? `The template's example row (row ${health.exampleRow}) was skipped.` : "No example row was found, so nothing was skipped."}</p>
        </section>

        <section aria-labelledby="h-blank">
          <h3 id="h-blank" className="font-bold">
            Blank answers
          </h3>
          {health.blanks.length === 0 ? (
            <p className="text-sm">No blanks. Every column was filled in for every row.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="desk-table">
                <caption className="sr-only">Blank answers per column</caption>
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Blank rows</th>
                  </tr>
                </thead>
                <tbody>
                  {health.blanks.map((b) => (
                    <tr key={b.column}>
                      <th scope="row" className="!bg-transparent !normal-case !tracking-normal !text-ink !text-sm font-semibold">
                        {b.column}
                      </th>
                      <td className="mono">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="h-changes">
          <h3 id="h-changes" className="font-bold">
            Values we changed while cleaning ({health.changes.length})
          </h3>
          {health.changes.length === 0 ? (
            <p className="text-sm">Nothing needed changing.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="desk-table">
                <caption className="sr-only">Values changed while cleaning</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Application</th>
                    <th scope="col">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {health.changes.map((c, i) => (
                    <tr key={i}>
                      <td className="mono">{c.row}</td>
                      <td className="mono">{c.id}</td>
                      <td>{c.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="h-errors">
          <h3 id="h-errors" className="font-bold">
            Errors by sheet ({health.errors.length})
          </h3>
          {clean ? (
            <p className="text-sm">
              <span aria-hidden="true" className="font-bold text-[#0e6b43]">
                ✓{" "}
              </span>
              No errors found on any sheet.
            </p>
          ) : (
            <div className="space-y-3">
              {sheetNames
                .filter((n) => bySheet.has(n))
                .map((n) => (
                  <div key={n} className="rounded-xl border border-[#f6c6c0] bg-[#fff5f4] p-3">
                    <p className="font-bold">
                      <span aria-hidden="true">! </span>
                      {n} ({bySheet.get(n)!.length})
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {bySheet.get(n)!.map((e, i) => (
                        <li key={i}>
                          <span className="mono font-bold">Row {e.row}:</span> {e.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
      <Link href="/board" className="btn mt-5">
        See the decisions
      </Link>
    </Card>
  );
}
