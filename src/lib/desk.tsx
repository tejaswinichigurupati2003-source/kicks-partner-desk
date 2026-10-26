"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Assumptions } from "@/engine/config";
import { applyChange, type Change } from "@/engine/rerun";
import type { StageStatus } from "@/engine/plans";
import { run } from "@/engine/run";
import type { Hint, RunResult, Status } from "@/engine/types";
import type { DiffCard, Trigger } from "./diffcard";
import { emptyWorkspace, normaliseWorkspace, toRunInput, type DataHealth, type Workspace } from "./workspace";

export type SaveState = "idle" | "saving" | "saved" | "error";

const LOCAL_KEY = "kicks-partner-desk-workspace";
const NAME_KEY = "kicks-partner-desk-name";

interface Meta {
  trigger: Trigger;
  summary: string;
  targetId?: string | null;
}

export interface Desk {
  ready: boolean;
  ws: Workspace;
  result: RunResult;
  now: Date;
  hasData: boolean;
  runId: string | null;
  save: SaveState;
  /** True when the server is not available and changes only live in this tab. */
  localOnly: boolean;
  note: string | null;
  dismissNote: () => void;
  actor: string;
  setActor: (name: string) => void;
  refresh: () => Promise<void>;
  importFile: (file: File, mode: "replace" | "add") => Promise<{ ok: true; health: DataHealth } | { ok: false; error: string }>;
  loadPractice: () => Promise<{ ok: true; health: DataHealth } | { ok: false; error: string }>;
  newWorkspace: () => Promise<void>;
  saveChange: (id: string, change: Change, summary: string) => Promise<DiffCard | null>;
  setOverride: (id: string, status: Status, reason: string) => Promise<DiffCard | null>;
  clearOverride: (id: string) => Promise<DiffCard | null>;
  setStage: (id: string, stage: string, status: StageStatus) => void;
  toggleChecklist: (id: string, key: string, done: boolean) => void;
  setAssumptions: (next: Partial<Assumptions>, summary: string) => Promise<DiffCard | null>;
  setHints: (hints: Record<string, Hint>) => void;
  lastCard: DiffCard | null;
  clearCard: () => void;
  /** Called by the chat when the server saved something: show it and pick up the new data. */
  receiveCard: (card: DiffCard | null) => Promise<void>;
}

const Ctx = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const v = useContext(Ctx);
  if (!v) throw new Error("Desk not available");
  return v;
}

function safeRun(ws: Workspace): RunResult {
  try {
    return run(toRunInput(ws));
  } catch {
    const base = run({ applications: [], territories: [], stores: [] });
    return { ...base, problems: ["Something went wrong while working out the results."] };
  }
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [runId, setRunId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [localOnly, setLocalOnly] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actor, setActorState] = useState("Team member");
  const [lastCard, setLastCard] = useState<DiffCard | null>(null);

  const wsRef = useRef(ws);
  wsRef.current = ws;
  const rev = useRef(0);
  const serverOn = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const actorRef = useRef(actor);
  actorRef.current = actor;

  const headers = useCallback(() => ({ "Content-Type": "application/json", "x-actor": encodeURIComponent(actorRef.current) }), []);

  const applyServer = useCallback((data: Workspace, serverRev: number, id: string | null) => {
    rev.current = serverRev;
    const next = normaliseWorkspace(data);
    wsRef.current = next;
    setWs(next);
    if (id) setRunId(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const j = (await (await fetch("/api/run", { cache: "no-store" })).json()) as { ok: boolean; id?: string | null; data?: Workspace | null; rev?: number };
      if (!j.ok) return;
      serverOn.current = true;
      setLocalOnly(false);
      if (j.data && j.id) applyServer(j.data, j.rev ?? 0, j.id);
      else {
        rev.current = 0;
        setRunId(null);
      }
    } catch {
      /* try again on the next poll */
    }
  }, [applyServer]);

  // First load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("joined") === "1" || params.has("run")) {
      if (params.get("run") === "missing") setNote("That run link is no longer valid. You are in your own workspace.");
      params.delete("joined");
      params.delete("run");
      window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    }
    try {
      setActorState(localStorage.getItem(NAME_KEY) || "Team member");
    } catch {
      /* ignore */
    }
    setNow(new Date());
    (async () => {
      try {
        const j = (await (await fetch("/api/run", { cache: "no-store" })).json()) as { ok: boolean; reason?: string; id?: string | null; data?: Workspace | null; rev?: number };
        if (j.ok) {
          serverOn.current = true;
          if (j.data && j.id) applyServer(j.data, j.rev ?? 0, j.id);
        } else {
          // No server saving: keep work in this tab, with a copy in this browser.
          setLocalOnly(true);
          try {
            const raw = localStorage.getItem(LOCAL_KEY);
            if (raw) setWs(normaliseWorkspace(JSON.parse(raw) as Partial<Workspace>));
          } catch {
            /* ignore */
          }
        }
      } catch {
        setLocalOnly(true);
      }
      setReady(true);
    })();
  }, [applyServer]);

  useEffect(() => {
    if (!ready || !localOnly) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(ws));
    } catch {
      /* ignore */
    }
  }, [ws, ready, localOnly]);

  // Pick up teammates' changes and chat updates.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(async () => {
      if (!serverOn.current || pending.current > 0 || document.hidden) return;
      try {
        const j = (await (await fetch("/api/run", { cache: "no-store" })).json()) as { ok: boolean; id?: string | null; data?: Workspace | null; rev?: number };
        if (j.ok && j.data && j.id && (j.rev ?? 0) > rev.current) applyServer(j.data, j.rev ?? 0, j.id);
      } catch {
        /* try again next time */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [ready, applyServer]);

  /** Applies a change here at once, then saves it. Saves go one after another so none is lost. */
  const mutate = useCallback(
    (fn: (w: Workspace) => Workspace, meta: Meta): Promise<DiffCard | null> => {
      const next = fn(wsRef.current);
      wsRef.current = next;
      setWs(next);
      if (!serverOn.current) return Promise.resolve(null);
      pending.current += 1;
      setSave("saving");
      const job = chain.current.then(async (): Promise<DiffCard | null> => {
        try {
          const res = await fetch("/api/run", { method: "PUT", headers: headers(), body: JSON.stringify({ data: wsRef.current, rev: rev.current, meta }) });
          const j = (await res.json()) as { ok: boolean; reason?: string; id?: string; rev?: number; card?: DiffCard | null; data?: Workspace | null };
          if (j.ok) {
            rev.current = j.rev ?? rev.current;
            if (j.id) setRunId(j.id);
            setSave("saved");
            if (j.card && (j.card.target || j.card.knockOn.length)) setLastCard(j.card);
            return j.card ?? null;
          }
          if (j.reason === "conflict" && j.data) {
            applyServer(j.data, j.rev ?? 0, j.id ?? null);
            setNote("A teammate saved a change at the same time, so we loaded their latest version. Please repeat your last change if it is missing.");
            setSave("saved");
            return null;
          }
          setSave("error");
          return null;
        } catch {
          setSave("error");
          return null;
        } finally {
          pending.current -= 1;
        }
      });
      chain.current = job;
      return job;
    },
    [applyServer, headers],
  );

  const result = useMemo(() => safeRun(ws), [ws]);

  // Remember the day each applicant was first given an opening, so stages can show as overdue.
  useEffect(() => {
    if (!ready) return;
    const missing = Object.values(result.decisions).filter((d) => ["approved", "conditional", "redirected"].includes(d.status) && !ws.approvedOn[d.id]);
    if (missing.length === 0 || result.problems.length) return;
    const stamp = new Date().toISOString();
    void mutate((w) => ({ ...w, approvedOn: { ...w.approvedOn, ...Object.fromEntries(missing.map((d) => [d.id, stamp])) } }), { trigger: "stage", summary: "Recorded approval dates." });
  }, [result, ready, ws.approvedOn, mutate]);

  const post = useCallback(
    async (init: { headers?: Record<string, string>; body: BodyInit }, mode: "replace" | "add") => {
      try {
        const res = await fetch(`/api/run?mode=${mode}`, { method: "POST", headers: { "x-actor": encodeURIComponent(actorRef.current), ...(init.headers ?? {}) }, body: init.body });
        const j = (await res.json()) as { ok: boolean; error?: string; health?: DataHealth };
        if (!j.ok) return { ok: false as const, error: j.error ?? "We couldn't read the file. Please try again." };
        serverOn.current = true;
        setLocalOnly(false);
        await refresh();
        return { ok: true as const, health: j.health as DataHealth };
      } catch {
        return { ok: false as const, error: "We couldn't upload the file. Please check your connection and try again." };
      }
    },
    [refresh],
  );

  const value: Desk = {
    ready,
    ws,
    result,
    now,
    hasData: ws.applications.length > 0,
    runId,
    save,
    localOnly,
    note,
    dismissNote: () => setNote(null),
    actor,
    setActor: (name) => {
      const clean = name.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) || "Team member";
      setActorState(clean);
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {
        /* ignore */
      }
    },
    refresh,
    importFile: (file, mode) => {
      const body = new FormData();
      body.append("file", file);
      return post({ body }, mode);
    },
    loadPractice: () => post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practice: true }) }, "replace"),
    newWorkspace: async () => {
      if (serverOn.current) await post({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empty: true }) }, "replace");
      else setWs(emptyWorkspace());
    },
    saveChange: (id, change, summary) => mutate((w) => ({ ...w, applications: w.applications.map((a) => (a.id === id ? applyChange(a, change) : a)) }), { trigger: "edit", summary, targetId: id }),
    setOverride: (id, status, reason) => mutate((w) => ({ ...w, overrides: { ...w.overrides, [id]: { status, reason } } }), { trigger: "override", summary: `Decision for ${id} changed by the team. Reason: ${reason}`, targetId: id }),
    clearOverride: (id) =>
      mutate(
        (w) => {
          const o = { ...w.overrides };
          delete o[id];
          return { ...w, overrides: o };
        },
        { trigger: "override", summary: `Team decision for ${id} removed. The rules decide again.`, targetId: id },
      ),
    setStage: (id, stage, status) => void mutate((w) => ({ ...w, stages: { ...w.stages, [id]: { ...(w.stages[id] ?? {}), [stage]: status } } }), { trigger: "stage", summary: `${id}: ${stage} marked ${status}.` }),
    toggleChecklist: (id, key, done) => void mutate((w) => ({ ...w, checklist: { ...w.checklist, [id]: { ...(w.checklist[id] ?? {}), [key]: done } } }), { trigger: "stage", summary: `${id}: checklist updated.` }),
    setAssumptions: (next, summary) => mutate((w) => ({ ...w, assumptions: next }), { trigger: "assumption", summary }),
    setHints: (hints) => void mutate((w) => ({ ...w, hints: { ...w.hints, ...hints } }), { trigger: "stage", summary: "Read the applicants' free text." }),
    lastCard,
    clearCard: () => setLastCard(null),
    receiveCard: async (card) => {
      await refresh();
      if (card && (card.target || card.knockOn.length)) setLastCard(card);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
