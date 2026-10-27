"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { STATUS_LABEL } from "@/engine/run";
import { DEFAULT_ASSUMPTIONS } from "@/engine/config";
import type { Status, ScoreParts } from "@/engine/types";

export function Wordmark({ light = false, size = 34 }: { light?: boolean; size?: number }) {
  return (
    <svg role="img" aria-label="Kicks" width={size * 2.6} height={size} viewBox="0 0 104 40" style={{ display: "block" }}>
      <path d="M2 36 L18 4 L26 4 L10 36 Z" fill="#FF4B1F" />
      <text x="8" y="33" transform="skewX(-8)" fontFamily="var(--font-display), Impact, sans-serif" fontWeight={900} fontSize="38" fill={light ? "#fff" : "#111"} letterSpacing="1">
        KICKS
      </text>
    </svg>
  );
}

export const STATUS_MARK: Record<Status, string> = { approved: "✓", conditional: "◐", redirected: "↪", waiting: "…", needs_info: "?", not_in_plan: "–", not_eligible: "✕", withdrawn: "↩" };

export function StatusStamp({ status, flat = false }: { status: Status; flat?: boolean }) {
  return (
    <span className={`stamp s-${status} ${flat ? "stamp-flat" : ""}`}>
      <span aria-hidden="true">{STATUS_MARK[status]} </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ScoreTag({ score }: { score: number | null }) {
  return (
    <span className="tag" title="Score out of 100">
      SCORE <b>{score === null ? "—" : Math.round(score)}</b>
    </span>
  );
}

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl text-[17px] text-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className = "", selected = false }: { children: ReactNode; className?: string; selected?: boolean }) {
  return <div className={`card ${selected ? "card-selected" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display-up mb-3 text-[16px] leading-tight">{children}</h2>;
}

export function ShoeboxEmpty() {
  return (
    <svg width="160" height="110" viewBox="0 0 160 110" aria-hidden="true" fill="none" stroke="#111" strokeWidth="3" strokeLinejoin="round">
      <path d="M20 50 L20 98 L140 98 L140 50" fill="#FFFDF8" />
      <path d="M14 42 L146 42 L146 52 L14 52 Z" fill="#D4FF3A" transform="rotate(-8 80 47) translate(0 -12) " />
      <path d="M20 50 L140 50" />
      <path d="M60 68 L100 68" strokeDasharray="4 6" />
      <path d="M36 98 L56 80" stroke="#FF4B1F" />
    </svg>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <ShoeboxEmpty />
      <h2 className="font-display-up text-[16px] leading-tight">{title}</h2>
      <p className="max-w-md text-muted">{text}</p>
      {action}
    </Card>
  );
}

interface LatestRun {
  id: string;
  fileName: string | null;
  applications: number;
  updatedAt: string;
}

/** The most recent run that has applications in it, so an empty screen can jump straight to data. */
function LatestRunButton() {
  const [run, setRun] = useState<LatestRun | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/run/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; runs?: LatestRun[] }) => {
        if (live && j.ok) setRun((j.runs ?? []).find((r) => r.applications > 0) ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!run) return null;
  const when = new Date(run.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <a className="btn btn-ghost flex-col !items-start !gap-0 text-left no-underline" href={"/run/" + run.id}>
      <span>Open the latest run</span>
      <span className="text-xs font-normal text-muted">
        {run.fileName ?? "Run"} · {run.applications} applications · {when}
      </span>
    </a>
  );
}

export function ImportButton({ label = "Import applications" }: { label?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Link className="btn" href="/import">
        {label}
      </Link>
      <LatestRunButton />
    </div>
  );
}

export function Term({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <abbr title={hint} style={{ textDecorationStyle: "dotted", cursor: "help" }}>
      {children}
    </abbr>
  );
}

export const PART_LABEL: Record<keyof ScoreParts, string> = {
  investment: "Investment",
  space: "Space readiness",
  experience: "Retail experience",
  timeline: "Timeline realism",
  priority: "Area priority",
  completeness: "Complete application",
};

export function ScoreBreakdown({ parts, weights = DEFAULT_ASSUMPTIONS.weights }: { parts: ScoreParts; weights?: Record<keyof ScoreParts, number> }) {
  return (
    <ul className="space-y-2">
      {(Object.keys(PART_LABEL) as (keyof ScoreParts)[]).map((k) => (
        <li key={k} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-sm max-sm:grid-cols-[120px_1fr_56px]">
          <span>{PART_LABEL[k]}</span>
          <span className="h-3 overflow-hidden rounded-sm border-2 border-ink bg-box" role="presentation">
            <span className="block h-full bg-ink" style={{ width: `${Math.min(100, (parts[k] / weights[k]) * 100)}%` }} />
          </span>
          <span className="mono text-right">
            {parts[k]}/{weights[k]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div role="img" aria-label={label} className="h-4 overflow-hidden rounded-sm border-2 border-ink bg-box">
      <div className="h-full" style={{ width: `${pct}%`, background: "var(--orange)" }} />
    </div>
  );
}

export function Lace({ states }: { states: ("done" | "now" | "todo" | "stuck")[] }) {
  return (
    <div className="flex items-center" role="img" aria-label={`${states.filter((s) => s === "done").length} of ${states.length} stages done`}>
      {states.map((s, i) => (
        <div key={i} className="flex items-center">
          <span className={`eyelet ${s === "done" ? "eyelet-done" : s === "now" ? "eyelet-now" : s === "stuck" ? "eyelet-stuck" : ""}`} />
          {i < states.length - 1 && <span className="h-[3px] w-5 sm:w-8" style={{ background: s === "done" ? "var(--orange)" : "var(--soft-line)" }} />}
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-6 rounded-md border-2 border-danger bg-[#ffd9d3] p-4 font-semibold text-danger">
      <span aria-hidden="true">! </span>
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="text-muted">Loading your workspace…</p>;
}
