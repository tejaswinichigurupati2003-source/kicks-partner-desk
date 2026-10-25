"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EXISTING_STORES } from "@/engine/config";
import { run } from "@/engine/run";
import type { Change } from "@/engine/rerun";
import { applyChange } from "@/engine/rerun";
import type { StageStatus } from "@/engine/plans";
import type { Application, Override, RunResult, Status, Store, Territory } from "@/engine/types";

export interface LogEntry {
  at: string;
  id: string;
  kind: "change" | "decision" | "import";
  text: string;
}

interface Workspace {
  v: 1;
  savedAt: string;
  fileName: string | null;
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  overrides: Record<string, Override>;
  stages: Record<string, Record<string, StageStatus>>;
  approvedOn: Record<string, string>;
  log: LogEntry[];
}

const KEY = "kicks-partner-desk-workspace";
const KEEP_DAYS = 7;

const empty = (): Workspace => ({
  v: 1,
  savedAt: new Date().toISOString(),
  fileName: null,
  applications: [],
  territories: [],
  stores: EXISTING_STORES,
  overrides: {},
  stages: {},
  approvedOn: {},
  log: [],
});

interface Desk {
  ready: boolean;
  ws: Workspace;
  result: RunResult;
  now: Date;
  hasData: boolean;
  importData: (d: { applications: Application[]; territories: Territory[]; stores: Store[]; fileName: string }, mode: "replace" | "add") => void;
  saveChange: (id: string, change: Change, note: string) => void;
  setOverride: (id: string, status: Status, reason: string) => void;
  clearOverride: (id: string) => void;
  setStage: (id: string, stage: string, status: StageStatus) => void;
  clearAll: () => void;
}

const Ctx = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("Desk not available");
  return v;
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(empty);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Workspace;
        const age = (Date.now() - new Date(parsed.savedAt).getTime()) / 86400000;
        if (parsed.v === 1 && age <= KEEP_DAYS) setWs({ ...empty(), ...parsed, stores: parsed.stores?.length ? parsed.stores : EXISTING_STORES });
        else localStorage.removeItem(KEY);
      }
    } catch {
      /* storage blocked: the Desk still works for this visit */
    }
    loaded.current = true;
    setNow(new Date());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ws));
    } catch {
      /* ignore */
    }
  }, [ws, ready]);

  const result = useMemo(() => {
    try {
      return run({ applications: ws.applications, territories: ws.territories, stores: ws.stores, overrides: ws.overrides });
    } catch {
      return { decisions: {}, order: [], territories: [], shortlist: [], problems: ["Something went wrong while working out the results."] } as RunResult;
    }
  }, [ws.applications, ws.territories, ws.stores, ws.overrides]);

  // Remember the day each applicant was first approved, so stages can show as overdue.
  useEffect(() => {
    if (!ready) return;
    const missing = Object.values(result.decisions).filter((d) => (d.status === "approved" || d.status === "conditional") && !ws.approvedOn[d.id]);
    if (missing.length === 0 || result.problems.length) return;
    setWs((w) => ({ ...w, approvedOn: { ...w.approvedOn, ...Object.fromEntries(missing.map((d) => [d.id, new Date().toISOString()])) } }));
  }, [result, ready, ws.approvedOn]);

  const log = (w: Workspace, e: Omit<LogEntry, "at">): Workspace => ({ ...w, log: [{ ...e, at: new Date().toISOString() }, ...w.log].slice(0, 500) });

  const importData: Desk["importData"] = useCallback((d, mode) => {
    setWs((w) => {
      const base = mode === "replace" ? { ...empty(), log: w.log } : w;
      const byId = new Map(base.applications.map((a) => [a.id, a]));
      for (const a of d.applications) if (!byId.has(a.id)) byId.set(a.id, a);
      const territories = mode === "replace" ? d.territories : [...base.territories, ...d.territories.filter((t) => !base.territories.some((x) => x.id === t.id))];
      const next: Workspace = {
        ...base,
        savedAt: new Date().toISOString(),
        fileName: d.fileName,
        applications: [...byId.values()],
        territories,
        stores: d.stores.length ? d.stores : EXISTING_STORES,
      };
      return log(next, { id: "", kind: "import", text: `${mode === "replace" ? "Replaced the list with" : "Added"} ${d.applications.length} applications from ${d.fileName}.` });
    });
  }, []);

  const saveChange: Desk["saveChange"] = useCallback((id, change, note) => {
    setWs((w) => log({ ...w, savedAt: new Date().toISOString(), applications: w.applications.map((a) => (a.id === id ? applyChange(a, change) : a)) }, { id, kind: "change", text: note }));
  }, []);

  const setOverride: Desk["setOverride"] = useCallback((id, status, reason) => {
    setWs((w) => log({ ...w, savedAt: new Date().toISOString(), overrides: { ...w.overrides, [id]: { status, reason } } }, { id, kind: "decision", text: `Decision changed. Reason: ${reason}` }));
  }, []);

  const clearOverride: Desk["clearOverride"] = useCallback((id) => {
    setWs((w) => {
      const o = { ...w.overrides };
      delete o[id];
      return log({ ...w, overrides: o }, { id, kind: "decision", text: "Team decision removed. The rules decide again." });
    });
  }, []);

  const setStage: Desk["setStage"] = useCallback((id, stage, status) => {
    setWs((w) => ({ ...w, stages: { ...w.stages, [id]: { ...(w.stages[id] ?? {}), [stage]: status } } }));
  }, []);

  const clearAll = useCallback(() => {
    setWs(empty());
  }, []);

  const value: Desk = { ready, ws, result, now, hasData: ws.applications.length > 0, importData, saveChange, setOverride, clearOverride, setStage, clearAll };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
