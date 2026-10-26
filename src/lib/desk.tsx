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
  report: string[];
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
  report: [],
});

export interface SyncState {
  status: "local" | "saving" | "saved" | "paused";
  workspaceId: string | null;
  note: string | null;
}

interface Desk {
  ready: boolean;
  sync: SyncState;
  newWorkspace: () => Promise<void>;
  dismissNote: () => void;
  ws: Workspace;
  result: RunResult;
  now: Date;
  hasData: boolean;
  importData: (d: { applications: Application[]; territories: Territory[]; stores: Store[]; fileName: string; messages: string[] }, mode: "replace" | "add") => void;
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
  const [sync, setSync] = useState<SyncState>({ status: "local", workspaceId: null, note: null });
  const serverOn = useRef(false);
  const rev = useRef(0);
  const dirty = useRef(false);
  const applyingServer = useRef(false);
  const wsRef = useRef(ws);
  wsRef.current = ws;

  /** Replaces the workspace with what the server holds, without sending it straight back. */
  const applyServer = useCallback((data: Workspace, serverRev: number) => {
    applyingServer.current = true;
    rev.current = serverRev;
    dirty.current = false;
    setWs({ ...empty(), ...data, report: data.report ?? [], stores: data.stores?.length ? data.stores : EXISTING_STORES });
  }, []);

  /** Saves a first copy so the workspace exists and has a link to share. */
  const createWorkspace = useCallback(async (initial: Workspace) => {
    try {
      const res = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: initial, rev: 0 }) });
      const k = (await res.json()) as { ok: boolean; id?: string; rev?: number };
      if (k.ok) {
        rev.current = k.rev ?? 1;
        dirty.current = false;
        setSync((x) => ({ ...x, status: "saved", workspaceId: k.id ?? x.workspaceId }));
      }
    } catch {
      /* the next change will try again */
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joined = params.get("joined") === "1";
    let hadLocal = false;
    try {
      if (joined) localStorage.removeItem(KEY);
      const raw = joined ? null : localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Workspace;
        const age = (Date.now() - new Date(parsed.savedAt).getTime()) / 86400000;
        if (parsed.v === 1 && age <= KEEP_DAYS) {
          hadLocal = (parsed.applications?.length ?? 0) > 0;
          setWs({ ...empty(), ...parsed, report: parsed.report ?? [], stores: parsed.stores?.length ? parsed.stores : EXISTING_STORES });
        } else localStorage.removeItem(KEY);
      }
    } catch {
      /* storage blocked: the Desk still works for this visit */
    }
    if (joined || params.has("workspace")) {
      params.delete("joined");
      const missing = params.get("workspace") === "missing";
      params.delete("workspace");
      window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
      if (missing) setSync((s) => ({ ...s, note: "That workspace link is no longer valid. You are in your own workspace." }));
    }
    setNow(new Date());
    setReady(true);
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((j: { ok: boolean; id?: string | null; data?: Workspace | null; rev?: number }) => {
        if (!j.ok) return;
        serverOn.current = true;
        setSync((s) => ({ ...s, status: "saved", workspaceId: j.id ?? null }));
        if (j.data && j.data.v === 1) applyServer(j.data, j.rev ?? 0);
        else void createWorkspace(hadLocal ? wsRef.current : empty());
      })
      .catch(() => undefined);
  }, [applyServer, createWorkspace]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ws));
    } catch {
      /* ignore */
    }
  }, [ws, ready]);

  // Save to the shared workspace shortly after every change.
  useEffect(() => {
    if (!ready || !serverOn.current) return;
    if (applyingServer.current) {
      applyingServer.current = false;
      return;
    }
    dirty.current = true;
    setSync((s) => (s.status === "paused" ? s : { ...s, status: "saving" }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: wsRef.current, rev: rev.current }) });
        const j = (await res.json()) as { ok: boolean; reason?: string; rev?: number; id?: string; data?: Workspace | null };
        if (j.ok) {
          rev.current = j.rev ?? rev.current;
          dirty.current = false;
          setSync((s) => ({ status: "saved", workspaceId: j.id ?? s.workspaceId, note: null }));
        } else if (j.reason === "conflict" && j.data) {
          applyServer(j.data, j.rev ?? 0);
          setSync((s) => ({ ...s, status: "saved", note: "A teammate saved a change at the same time, so we loaded their latest version. Please repeat your last change if it is missing." }));
        } else setSync((s) => ({ ...s, status: "paused" }));
      } catch {
        setSync((s) => ({ ...s, status: "paused" }));
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [ws, ready, applyServer]);

  // Pick up teammates' changes.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(async () => {
      if (!serverOn.current || dirty.current || document.hidden) return;
      try {
        const j = (await (await fetch("/api/workspace")).json()) as { ok: boolean; data?: Workspace | null; rev?: number };
        if (j.ok && j.data && (j.rev ?? 0) > rev.current) applyServer(j.data, j.rev ?? 0);
      } catch {
        /* try again next time */
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [ready, applyServer]);

  const newWorkspace = useCallback(async () => {
    try {
      await fetch("/api/workspace", { method: "DELETE" });
      const j = (await (await fetch("/api/workspace")).json()) as { ok: boolean; id?: string | null };
      applyingServer.current = true;
      rev.current = 0;
      dirty.current = false;
      setWs(empty());
      setSync({ status: j.ok ? "saved" : "local", workspaceId: j.id ?? null, note: null });
      if (j.ok) await createWorkspace(empty());
    } catch {
      /* stay in the current workspace */
    }
  }, [createWorkspace]);

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
        report: d.messages,
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

  const dismissNote = () => setSync((x) => ({ ...x, note: null }));
  const value: Desk = { ready, sync, newWorkspace, dismissNote, ws, result, now, hasData: ws.applications.length > 0, importData, saveChange, setOverride, clearOverride, setStage, clearAll };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
