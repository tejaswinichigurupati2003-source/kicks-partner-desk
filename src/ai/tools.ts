import { DEFAULT_ASSUMPTIONS, mergeAssumptions } from "@/engine/config";
import { applyChange, scenariosFor, type Change } from "@/engine/rerun";
import { HOLDS_OPENING, run, STATUS_LABEL } from "@/engine/run";
import type { Application, Decision, RunResult } from "@/engine/types";
import { assumptionLabel } from "@/engine/labels";
import { buildDiffCard, type DiffCard, type Trigger } from "@/lib/diffcard";
import { toRunInput, type Workspace } from "@/lib/workspace";
import type { ToolSpec } from "./openrouter";

export interface PersistMeta {
  trigger: Trigger;
  actor: string;
  summary: string;
  targetId?: string | null;
}
export type PersistResult = { ok: true; rev: number; card: DiffCard | null } | { ok: false; conflict: boolean };

/** The run the chat is working on, and the way to save a change to it. */
export interface ToolContext {
  ws: Workspace;
  rev: number;
  actor: string;
  persist: (next: Workspace, meta: PersistMeta) => Promise<PersistResult>;
  cards: DiffCard[];
  saved: boolean;
  /** Set by the server when the person asked a what-if question. Every change then runs as a preview, whatever the model asked for. */
  forcePreview?: boolean;
}

/** A context that saves in memory, for tests and for trying the tools without a database. */
export function memoryContext(ws: Workspace, actor = "Team member"): ToolContext {
  const ctx: ToolContext = {
    ws,
    rev: 1,
    actor,
    cards: [],
    saved: false,
    persist: async (next, meta) => {
      const before = run(toRunInput(ctx.ws));
      const after = run(toRunInput(next));
      const names = Object.fromEntries(next.applications.map((a) => [a.id, a.name]));
      const card = buildDiffCard(before, after, names, meta.targetId ?? null, { trigger: meta.trigger, summary: meta.summary, groupId: null, undoable: false });
      return { ok: true, rev: ctx.rev + 1, card };
    },
  };
  return ctx;
}

export function findApp(ws: Workspace, id: string): Application | null {
  const digits = String(id).match(/\d+/)?.[0];
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return ws.applications.find((a) => a.id.toLowerCase() === String(id).toLowerCase()) ?? ws.applications.find((a) => parseInt(a.id.replace(/\D/g, ""), 10) === n) ?? null;
}

const current = (ctx: ToolContext): RunResult => run(toRunInput(ctx.ws));

function breakdown(d: Decision, result: RunResult) {
  if (!d.parts) return null;
  const w = result.assumptions.weights;
  return (Object.keys(d.parts) as (keyof typeof d.parts)[]).map((k) => ({ part: k, points: d.parts![k], max: w[k] }));
}

function decisionFacts(d: Decision, result: RunResult) {
  return {
    id: d.id,
    status: STATUS_LABEL[d.status],
    verdict: d.verdict,
    score: d.score,
    scoreBreakdown: breakdown(d, result),
    territory: d.territoryId,
    assignedPin: d.assignedPin,
    redirectPin: d.redirectPin,
    rank: d.rank,
    waitingPosition: d.position,
    ahead: d.ahead,
    conditions: d.condition.map((c) => c.text),
    nextStep: d.nextStep,
  };
}

function notFound(id: string) {
  return { error: "not_found", message: `No application ${id} in this run.` };
}

function summariseCard(card: DiffCard | null) {
  if (!card) return null;
  const line = (l: DiffCard["knockOn"][number]) => ({ id: l.id, status: `${l.was} → ${l.now}`, score: `${l.beforeScore ?? "none"} → ${l.afterScore ?? "none"}`, pin: `${l.beforePin ?? "none"} → ${l.afterPin ?? "none"}`, why: l.why });
  return { target: card.target ? line(card.target) : null, knockOnEffects: card.knockOn.map(line) };
}

/** A what-if: runs the change on a copy and builds the card, without saving anything or writing to the audit log. */
function previewOf(ctx: ToolContext, next: Workspace, meta: PersistMeta, action: Action) {
  const before = run(toRunInput(ctx.ws));
  const after = run(toRunInput(next));
  const names = Object.fromEntries(next.applications.map((a) => [a.id, a.name]));
  const card = { ...buildDiffCard(before, after, names, meta.targetId ?? null, { trigger: meta.trigger, summary: meta.summary, groupId: null, undoable: false }), preview: true, action };
  ctx.cards.push(card);
  return { preview: true, saved: false, note: "Nothing was saved. The screen shows a preview with an Apply button.", ...summariseCard(card) };
}

interface Action {
  tool: string;
  args: Record<string, unknown>;
}

const wantsPreview = (ctx: ToolContext, args: { mode?: string }) => ctx.forcePreview === true || args.mode === "preview";

async function commit(ctx: ToolContext, next: Workspace, meta: PersistMeta, action: Action, args: { mode?: string }) {
  if (wantsPreview(ctx, args)) return previewOf(ctx, next, meta, { tool: action.tool, args: { ...action.args, mode: "apply" } });
  const res = await ctx.persist(next, meta);
  if (!res.ok) return { error: "conflict", message: "A teammate changed this run at the same moment. Nothing was saved. Ask again to retry." };
  ctx.ws = next;
  ctx.rev = res.rev;
  ctx.saved = true;
  if (res.card) ctx.cards.push(res.card);
  return { saved: true, ...summariseCard(res.card) };
}

const SPACES = ["Owned", "Rented", "Not yet identified"] as const;
const FLOORS = ["Ground", "Upper", "Mall unit", "Not known"] as const;

export interface UpdateArgs {
  mode?: "preview" | "apply";
  id: string;
  space?: string;
  size?: number;
  floor?: string;
  investment?: number;
  experience?: number;
  target?: number;
  pin?: string;
  language?: string;
}

/** Saves new information about an applicant. Asks one question, and saves nothing, when it would have to guess. */
export async function updateApplication(ctx: ToolContext, args: UpdateArgs) {
  const app = findApp(ctx.ws, args.id);
  if (!app) return notFound(args.id);
  const change: Change = {};
  if (args.space !== undefined) {
    const s = SPACES.find((x) => x.toLowerCase() === String(args.space).toLowerCase());
    if (!s) return { needs_clarification: "Is the space owned, rented, or not yet identified?" };
    change.space = s;
  }
  if (args.floor !== undefined) {
    const f = FLOORS.find((x) => x.toLowerCase() === String(args.floor).toLowerCase());
    if (!f) return { needs_clarification: "Is the shop on the ground floor, an upper floor, or a mall unit?" };
    change.floor = f;
  }
  if (typeof args.size === "number" && args.size > 0) change.size = args.size;
  if (typeof args.investment === "number" && args.investment >= 0) change.investment = args.investment;
  if (typeof args.experience === "number" && args.experience >= 0) change.experience = args.experience;
  if (typeof args.target === "number" && args.target >= 0) change.target = args.target;
  if (typeof args.pin === "string" && /^\d{6}$/.test(args.pin)) change.pin = args.pin;
  if (args.language && ["Kannada", "English", "Hindi"].includes(args.language)) change.language = args.language as Change["language"];
  if (Object.keys(change).length === 0) return { needs_clarification: `What changed for ${app.id}? For example the space, its size, the floor, the investment or the launch target.` };

  const hadSpace = app.space === "Owned" || app.space === "Rented";
  const spaceAfter = change.space ?? app.space;
  if (!hadSpace && change.space === undefined && (change.floor !== undefined || change.size !== undefined)) return { needs_clarification: `Is the shop ${app.id} found owned or rented?` };
  if ((spaceAfter === "Owned" || spaceAfter === "Rented") && (change.size ?? app.size) === null) return { needs_clarification: `What is the size of the space in sq ft for ${app.id}?` };

  const next: Workspace = { ...ctx.ws, applications: ctx.ws.applications.map((a) => (a.id === app.id ? applyChange(a, change) : a)) };
  const parts = Object.entries(change).map(([k, v]) => `${k} ${v}`).join(", ");
  return commit(ctx, next, { trigger: "chat", actor: ctx.actor, summary: `${app.id} updated in chat: ${parts}.`, targetId: app.id }, { tool: "update_application", args: { ...args } }, args);
}

export async function withdrawApplication(ctx: ToolContext, args: { id: string; reason?: string; mode?: string }) {
  const app = findApp(ctx.ws, args.id);
  if (!app) return notFound(args.id);
  if (app.withdrawn) return { already: true, message: `${app.id} is already withdrawn.` };
  const next: Workspace = { ...ctx.ws, applications: ctx.ws.applications.map((a) => (a.id === app.id ? { ...a, withdrawn: true, withdrawnReason: args.reason?.slice(0, 200) } : a)) };
  return commit(ctx, next, { trigger: "chat", actor: ctx.actor, summary: `${app.id} withdrew${args.reason ? `: ${args.reason.slice(0, 120)}` : ""}.`, targetId: app.id }, { tool: "withdraw_application", args: { ...args } }, args);
}

export async function updateTerritory(ctx: ToolContext, args: { id: string; slots_delta: number; mode?: string }) {
  const t = ctx.ws.territories.find((x) => x.id.toLowerCase() === String(args.id).toLowerCase() || x.id.replace(/\D/g, "") === String(args.id).replace(/\D/g, ""));
  if (!t) return { error: "not_found", message: `No area ${args.id} in this run.` };
  const delta = Math.trunc(Number(args.slots_delta));
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 20) return { needs_clarification: "How many openings should be added or removed?" };
  const slots = Math.max(0, t.slots + delta);
  const next: Workspace = { ...ctx.ws, territories: ctx.ws.territories.map((x) => (x.id === t.id ? { ...x, slots } : x)) };
  return commit(ctx, next, { trigger: "territory", actor: ctx.actor, summary: `${t.id} openings changed from ${t.slots} to ${slots}.` }, { tool: "update_territory", args: { ...args } }, args);
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown) {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[path[path.length - 1]] = value;
}

/** Changes one assumption by its path, for example "minScoreToAllocate" or "weights.investment". */
export async function setAssumption(ctx: ToolContext, args: { key: string; value: number | boolean; mode?: string }) {
  const path = String(args.key).split(".");
  let ref: unknown = DEFAULT_ASSUMPTIONS;
  for (const k of path) {
    if (ref === null || typeof ref !== "object" || !(k in (ref as object))) return { error: "unknown_assumption", message: `There is no assumption called ${args.key}.` };
    ref = (ref as Record<string, unknown>)[k];
  }
  if (typeof ref !== typeof args.value || typeof ref === "object") return { error: "invalid", message: `${args.key} must be a ${typeof ref === "object" ? "single number" : typeof ref}.` };
  if (typeof args.value === "number" && (!Number.isFinite(args.value) || args.value < 0)) return { error: "invalid", message: "The value must be zero or more." };
  const merged = JSON.parse(JSON.stringify(mergeAssumptions(ctx.ws.assumptions))) as Record<string, unknown>;
  const old = path.reduce((o: unknown, k) => (o as Record<string, unknown>)[k], merged);
  setPath(merged, path, args.value);
  const next: Workspace = { ...ctx.ws, assumptions: merged as unknown as Workspace["assumptions"] };
  return commit(ctx, next, { trigger: "assumption", actor: ctx.actor, summary: `Assumption change: ${assumptionLabel(args.key)} ${String(old)} → ${String(args.value)}.` }, { tool: "set_assumption", args: { ...args } }, args);
}

export function getApplication(ctx: ToolContext, args: { id: string }) {
  const app = findApp(ctx.ws, args.id);
  if (!app) return notFound(args.id);
  const result = current(ctx);
  const d = result.decisions[app.id];
  return {
    application: {
      id: app.id, city: app.city, requestedPin: app.pin, investmentLakh: app.investment, experienceYears: app.experience, space: app.space, sizeSqFt: app.size, floor: app.floor,
      targetLaunchMonths: app.target, preferredLanguage: app.language, withdrawn: !!app.withdrawn,
    },
    decision: d ? decisionFacts(d, result) : null,
  };
}

export function explainDecision(ctx: ToolContext, args: { id: string }) {
  const app = findApp(ctx.ws, args.id);
  if (!app) return notFound(args.id);
  const input = toRunInput(ctx.ws);
  const result = run(input);
  const d = result.decisions[app.id];
  if (!d) return { error: "no_decision", message: "There is no stored decision for this application yet." };
  return {
    ...decisionFacts(d, result),
    requestedPin: app.pin,
    reasonTrail: d.reasonTrail,
    tieBreak: d.tieBreak,
    competitorsForSamePin: d.competitors.map((c) => ({ id: c.id, score: c.score, status: STATUS_LABEL[c.status] })),
    improvements: d.improvements,
    whatWouldChange: scenariosFor(input, app.id).map((s) => s.text),
  };
}

export function compareApplicants(ctx: ToolContext, args: { ids: string[] }) {
  const result = current(ctx);
  const items = (args.ids ?? []).slice(0, 4).map((id) => {
    const app = findApp(ctx.ws, id);
    if (!app) return notFound(id);
    const d = result.decisions[app.id];
    const holder = Object.values(result.decisions).find((x) => x.id !== app.id && HOLDS_OPENING.includes(x.status) && x.assignedPin === app.pin);
    const own = d && HOLDS_OPENING.includes(d.status) && d.assignedPin === app.pin;
    const territory = result.territories.find((t) => t.territory.id === d?.territoryId);
    const pinState = territory?.pins.find((p) => p.pin === app.pin);
    return {
      ...(d ? decisionFacts(d, result) : { id: app.id }),
      requestedPin: app.pin,
      requestedPinState: pinState?.state ?? "not in any area",
      requestedPinHeldBy: own ? app.id : holder ? { id: holder.id, score: holder.score } : null,
      allocationLines: d?.reasonTrail.filter((t) => ["Allocation", "Minimum score", "Existing store", "Investment", "Tie-break"].includes(t.check)).map((t) => `${t.check}: ${t.detail}`) ?? [],
    };
  });
  return { items };
}

export function rerunEngine(ctx: ToolContext) {
  const result = current(ctx);
  const counts: Record<string, number> = {};
  for (const d of Object.values(result.decisions)) counts[STATUS_LABEL[d.status]] = (counts[STATUS_LABEL[d.status]] ?? 0) + 1;
  return { applications: ctx.ws.applications.length, counts, problems: result.problems, areas: result.territories.map((t) => ({ id: t.territory.id, openings: t.territory.slots, left: t.openingsLeft, waiting: t.waiting.length })) };
}

export async function executeTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "get_application":
        return getApplication(ctx, args as { id: string });
      case "explain_decision":
        return explainDecision(ctx, args as { id: string });
      case "compare_applicants":
        return compareApplicants(ctx, args as { ids: string[] });
      case "update_application":
        return await updateApplication(ctx, args as unknown as UpdateArgs);
      case "withdraw_application":
        return await withdrawApplication(ctx, args as { id: string; reason?: string; mode?: string });
      case "rerun_engine":
        return rerunEngine(ctx);
      case "set_assumption":
        return await setAssumption(ctx, args as { key: string; value: number | boolean; mode?: string });
      case "update_territory":
        return await updateTerritory(ctx, args as { id: string; slots_delta: number; mode?: string });
      default:
        return { error: "unknown_tool", message: `There is no tool called ${name}.` };
    }
  } catch {
    return { error: "failed", message: "That did not work. Nothing was saved." };
  }
}

const modeProp = { type: "string", enum: ["preview", "apply"], description: "preview for any what-if / suppose / what happens if question: nothing is saved and the person sees a preview with an Apply button. apply only when the person told you to make the change. Default apply." };
const idProp = { type: "string", description: "Application number, for example APP-012" };
export const TOOL_SPECS: ToolSpec[] = [
  { type: "function", function: { name: "get_application", description: "Facts and the stored decision for one application (no names).", parameters: { type: "object", properties: { id: idProp }, required: ["id"] } } },
  { type: "function", function: { name: "explain_decision", description: "The stored reason trail, score breakdown, competitors for the same pin and what would change the result. Use for every 'why' question.", parameters: { type: "object", properties: { id: idProp }, required: ["id"] } } },
  { type: "function", function: { name: "compare_applicants", description: "Side-by-side facts for 2 to 4 applications: score parts, requested pin, who holds it, status.", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["ids"] } } },
  {
    type: "function",
    function: {
      name: "update_application",
      description: "SAVE new information about an applicant and re-run the whole area. Only include fields that changed. If ownership (owned or rented) or the size is not known for a found space, do NOT call this: ask one short question first.",
      parameters: {
        type: "object",
        properties: {
          id: idProp,
          space: { type: "string", enum: ["Owned", "Rented", "Not yet identified"] },
          size: { type: "number", description: "Space size in sq ft" },
          floor: { type: "string", enum: ["Ground", "Upper", "Mall unit", "Not known"] },
          investment: { type: "number", description: "₹ lakh" },
          experience: { type: "number", description: "Years" },
          target: { type: "number", description: "Target launch in months" },
          pin: { type: "string", description: "6-digit pin code" },
          language: { type: "string", enum: ["Kannada", "English", "Hindi"] },
          mode: modeProp,
        },
        required: ["id"],
      },
    },
  },
  { type: "function", function: { name: "withdraw_application", description: "SAVE that an applicant has withdrawn, and re-run the whole area.", parameters: { type: "object", properties: { id: idProp, reason: { type: "string" }, mode: modeProp }, required: ["id"] } } },
  { type: "function", function: { name: "update_territory", description: "SAVE a change to an area's number of openings (for example 'add one opening to TER-03' is slots_delta 1) and re-run.", parameters: { type: "object", properties: { id: { type: "string", description: "Area, for example TER-03" }, slots_delta: { type: "number" }, mode: modeProp }, required: ["id", "slots_delta"] } } },
  { type: "function", function: { name: "set_assumption", description: "SAVE a change to one assumption by its path, for example minScoreToAllocate or weights.investment, and re-run everyone.", parameters: { type: "object", properties: { key: { type: "string" }, value: { type: ["number", "boolean"] }, mode: modeProp }, required: ["key", "value"] } } },
  { type: "function", function: { name: "rerun_engine", description: "Re-run the rules on the saved data and return counts, area openings and any problems. Saves nothing.", parameters: { type: "object", properties: {} } } },
];
