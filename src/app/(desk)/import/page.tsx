"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useDesk } from "@/lib/desk";
import { Card, ErrorBanner, PageHeader, SectionTitle } from "@/components/ui";
import type { Application, Store, Territory } from "@/engine/types";

interface Report {
  applicationRows: number;
  territoryRows: number;
  storeRows: number;
  messages: string[];
}
type Reply = { ok: true; applications: Application[]; territories: Territory[]; stores: Store[]; report: Report } | { ok: false; error: string };

export default function ImportPage() {
  const desk = useDesk();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<(Report & { fileName: string }) | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body });
      const data = (await res.json()) as Reply;
      if (!data.ok) setError(data.error);
      else {
        desk.importData({ applications: data.applications, territories: data.territories, stores: data.stores, fileName: file.name, messages: data.report.messages }, mode);
        setReport({ ...data.report, fileName: file.name });
      }
    } catch {
      setError("We couldn't upload the file. Please check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <PageHeader title="Import applications" intro="Bring in your applications and the areas you want to grow in from one Excel file. You'll get a decision and a reason for every applicant." />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <div
            className="card flex flex-col items-center gap-4 border-dashed px-6 py-14 text-center"
            style={{ background: drag ? "var(--lime)" : undefined }}
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
            <p className="font-display-up text-[34px] leading-none">Drop your Excel file here</p>
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
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="h-5 w-5 accent-black" />
                Replace current applications
              </label>
              <label className="flex min-h-[44px] items-center gap-2 font-semibold">
                <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} className="h-5 w-5 accent-black" />
                Add to them
              </label>
            </fieldset>
          </div>

          {report && (
            <Card className="p-5" selected>
              <h2 className="font-display-up mt-2 text-[30px] leading-none">File checked</h2>
              <p className="mt-2">
                <strong>{report.fileName}</strong>: {report.applicationRows} applications, {report.territoryRows} areas and {report.storeRows} existing stores were read.
              </p>
              {report.messages.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {report.messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <Link href="/board" className="btn mt-5">
                See the decisions
              </Link>
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
            <SectionTitle>Your data</SectionTitle>
            <p className="text-muted">Files are read and not stored on our servers. Your results stay in this browser for 7 days and are then deleted.</p>
            {desk.hasData && (
              <button
                className="btn btn-ghost btn-small mt-4"
                onClick={() => {
                  if (window.confirm("Remove all applications and changes from this browser?")) desk.clearAll();
                }}
              >
                Remove my data now
              </button>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
