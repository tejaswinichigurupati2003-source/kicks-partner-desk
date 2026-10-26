"use client";

import { useEffect, useState } from "react";
import { useDesk } from "@/lib/desk";
import { STATUS_LABEL } from "@/engine/run";
import type { Status } from "@/engine/types";
import { Card, EmptyState, Loading, PageHeader } from "@/components/ui";

interface RunRow {
  id: string;
  fileName: string | null;
  applications: number;
  counts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  lastChange: string | null;
  expiresAt: string;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));

export default function RunHistory() {
  const { runId, newWorkspace } = useDesk();
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/run/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.ok) setRows(j.runs);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [runId]);

  return (
    <>
      <PageHeader
        title="Run history"
        intro="Every upload is its own run. Starting a new run never deletes an earlier one: it stays here for 7 days after its last change, and you can open it again at any time."
        action={
          <button className="btn" onClick={() => window.confirm("Start a new, empty run? The current one stays in this list.") && void newWorkspace()}>
            Start a new run
          </button>
        }
      />
      {failed ? (
        <EmptyState title="History isn't available right now" text="Saving is paused, so the list of runs can't be shown. Try again in a moment." />
      ) : rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No runs yet" text="Import an Excel file or load the practice data to start your first run." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const here = r.id === runId;
            const parts = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4" selected={here}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {r.fileName ?? "Empty run"}
                      {here && <span className="rounded-full bg-[#e7efff] px-2 py-0.5 text-xs font-bold text-[#12306b]">You are here</span>}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {r.applications} applications · started {when(r.createdAt)} · last change {when(r.updatedAt)} · kept {daysLeft(r.expiresAt)} more {daysLeft(r.expiresAt) === 1 ? "day" : "days"}
                    </p>
                    {r.lastChange && <p className="mt-1 text-sm">Last saved change: {r.lastChange}</p>}
                    {parts.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-2 text-xs">
                        {parts.map(([s, n]) => (
                          <span key={s} className="inline-flex items-center gap-1 rounded-full border border-soft-line px-2 py-0.5">
                            <span className={`dot dot-${s}`} aria-hidden="true" />
                            {STATUS_LABEL[s as Status] ?? s}: {n}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  {here ? (
                    <span className="text-sm text-muted">Open now</span>
                  ) : (
                    <a className="btn btn-ghost btn-small no-underline" href={`/run/${r.id}`}>
                      Open this run
                    </a>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
