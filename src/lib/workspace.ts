import { EXISTING_STORES, type Assumptions } from "@/engine/config";
import type { StageStatus } from "@/engine/plans";
import type { Application, Hint, Override, RunInput, Store, Territory } from "@/engine/types";

/** What the file reader found while cleaning the upload. */
export interface DataHealth {
  sheets: { name: string; found: boolean; rows: number }[];
  applicationRows: number;
  territoryRows: number;
  storeRows: number;
  exampleRowSkipped: boolean;
  exampleRow: number | null;
  blanks: { column: string; count: number }[];
  changes: { row: number; id: string; text: string }[];
  errors: { sheet: string; row: number; text: string }[];
}

/** One run: the uploaded data, the team's settings and everything saved against it. */
export interface Workspace {
  v: 1;
  savedAt: string;
  fileName: string | null;
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  overrides: Record<string, Override>;
  assumptions: Partial<Assumptions>;
  hints: Record<string, Hint>;
  stages: Record<string, Record<string, StageStatus>>;
  checklist: Record<string, Record<string, boolean>>;
  approvedOn: Record<string, string>;
  report: string[];
  health: DataHealth | null;
}

export function emptyWorkspace(): Workspace {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    fileName: null,
    applications: [],
    territories: [],
    stores: EXISTING_STORES,
    overrides: {},
    assumptions: {},
    hints: {},
    stages: {},
    checklist: {},
    approvedOn: {},
    report: [],
    health: null,
  };
}

/** Fills anything an older save did not have. */
export function normaliseWorkspace(raw: Partial<Workspace> | null | undefined): Workspace {
  const base = emptyWorkspace();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    v: 1,
    stores: raw.stores?.length ? raw.stores : EXISTING_STORES,
    overrides: raw.overrides ?? {},
    assumptions: raw.assumptions ?? {},
    hints: raw.hints ?? {},
    stages: raw.stages ?? {},
    checklist: raw.checklist ?? {},
    approvedOn: raw.approvedOn ?? {},
    report: raw.report ?? [],
    health: raw.health ?? null,
  };
}

export function toRunInput(ws: Workspace): RunInput {
  return { applications: ws.applications, territories: ws.territories, stores: ws.stores, overrides: ws.overrides, assumptions: ws.assumptions, hints: ws.hints };
}
