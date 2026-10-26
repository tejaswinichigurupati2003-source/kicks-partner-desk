import type { Assumptions } from "@/engine/config";
import { mergeAssumptions } from "@/engine/config";
import type { Application, Override, Territory } from "@/engine/types";
import type { Workspace } from "./workspace";

/** The previous values of whatever a change touched. Applying it puts them back. */
export interface UndoPatch {
  applications?: Record<string, Application | null>;
  territories?: Record<string, Territory | null>;
  assumptions?: Partial<Assumptions>;
  overrides?: Record<string, Override>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function makePatch(before: Workspace, after: Workspace): UndoPatch | null {
  const patch: UndoPatch = {};
  const apps: Record<string, Application | null> = {};
  const oldApps = new Map(before.applications.map((a) => [a.id, a]));
  const newApps = new Map(after.applications.map((a) => [a.id, a]));
  for (const [id, a] of oldApps) if (!newApps.has(id) || !same(a, newApps.get(id))) apps[id] = a;
  for (const id of newApps.keys()) if (!oldApps.has(id)) apps[id] = null;
  if (Object.keys(apps).length) patch.applications = apps;

  const ters: Record<string, Territory | null> = {};
  const oldT = new Map(before.territories.map((t) => [t.id, t]));
  const newT = new Map(after.territories.map((t) => [t.id, t]));
  for (const [id, t] of oldT) if (!newT.has(id) || !same(t, newT.get(id))) ters[id] = t;
  for (const id of newT.keys()) if (!oldT.has(id)) ters[id] = null;
  if (Object.keys(ters).length) patch.territories = ters;

  if (!same(mergeAssumptions(before.assumptions), mergeAssumptions(after.assumptions))) patch.assumptions = before.assumptions;
  if (!same(before.overrides, after.overrides)) patch.overrides = before.overrides;
  return Object.keys(patch).length ? patch : null;
}

export function applyPatch(ws: Workspace, patch: UndoPatch): Workspace {
  const next: Workspace = { ...ws, applications: [...ws.applications], territories: [...ws.territories] };
  for (const [id, prev] of Object.entries(patch.applications ?? {})) {
    const i = next.applications.findIndex((a) => a.id === id);
    if (prev === null) {
      if (i >= 0) next.applications.splice(i, 1);
    } else if (i >= 0) next.applications[i] = prev;
    else next.applications.push(prev);
  }
  for (const [id, prev] of Object.entries(patch.territories ?? {})) {
    const i = next.territories.findIndex((t) => t.id === id);
    if (prev === null) {
      if (i >= 0) next.territories.splice(i, 1);
    } else if (i >= 0) next.territories[i] = prev;
    else next.territories.push(prev);
  }
  if (patch.assumptions) next.assumptions = patch.assumptions;
  if (patch.overrides) next.overrides = patch.overrides;
  return next;
}

/** Which assumption values changed, old and new. */
export function assumptionDelta(before: Partial<Assumptions>, after: Partial<Assumptions>): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = mergeAssumptions(before) as unknown as Record<string, unknown>;
  const a = mergeAssumptions(after) as unknown as Record<string, unknown>;
  const out = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const k of Object.keys(a)) if (!same(a[k], b[k])) {
    out.before[k] = b[k];
    out.after[k] = a[k];
  }
  return out;
}
