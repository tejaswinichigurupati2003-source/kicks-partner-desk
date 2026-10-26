import { HOLDS_OPENING, run, STATUS_LABEL } from "./run";
import type { Application, Decision, RunInput, RunResult, Status } from "./types";

export interface Change {
  space?: "Owned" | "Rented" | "Not yet identified";
  size?: number;
  floor?: "Ground" | "Upper" | "Mall unit" | "Not known";
  investment?: number;
  experience?: number;
  target?: number;
  pin?: string;
  language?: "Kannada" | "English" | "Hindi";
  withdrawn?: boolean;
}

export function applyChange(app: Application, change: Change, provisional = false): Application {
  const next: Application = { ...app };
  if (change.space) next.space = change.space;
  if (change.size !== undefined) next.size = change.size;
  if (change.floor) next.floor = change.floor;
  if (change.investment !== undefined) {
    next.investment = change.investment;
    next.investmentProblem = undefined;
  }
  if (change.experience !== undefined) {
    next.experience = change.experience;
    next.experienceProblem = undefined;
  }
  if (change.target !== undefined) next.target = change.target;
  if (change.pin) next.pin = change.pin;
  if (change.language) next.language = change.language;
  if (change.withdrawn !== undefined) next.withdrawn = change.withdrawn;
  if (change.space === "Not yet identified" && change.size === undefined) {
    next.size = null;
    if (!change.floor) next.floor = null;
  }
  if (provisional && (next.space === "Owned" || next.space === "Rented") && next.size === null) next.provisionalSize = true;
  else if (change.size !== undefined) next.provisionalSize = undefined;
  return next;
}

export interface DiffRow {
  id: string;
  name: string;
  before: Decision | null;
  after: Decision;
  was: string;
  now: string;
  why: string;
  beforePin: string | null;
  afterPin: string | null;
  beforeScore: number | null;
  afterScore: number | null;
}

export function labelOf(d: Decision | null): string {
  if (!d) return "New";
  if (d.status === "waiting" && d.position) return `${STATUS_LABEL[d.status]} (position ${d.position})`;
  if (d.status === "redirected" && d.redirectPin) return `${STATUS_LABEL[d.status]} to ${d.redirectPin}`;
  if (HOLDS_OPENING.includes(d.status) && d.assignedPin) return `${STATUS_LABEL[d.status]} at ${d.assignedPin}`;
  return STATUS_LABEL[d.status];
}

function whyChanged(before: Decision | null, after: Decision): string {
  if (!before) return "New application.";
  const allocation = after.reasonTrail.find((t) => t.check === "Allocation");
  if (HOLDS_OPENING.includes(after.status) && !HOLDS_OPENING.includes(before.status)) return allocation?.detail ?? after.verdict;
  if (after.status === "waiting") return allocation?.detail ?? after.verdict;
  return after.verdict;
}

/** Who changed between two runs: status, pin, place in line or rank. */
export function diff(before: RunResult, after: RunResult, names: Record<string, string>, first?: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const id of after.order) {
    const b = before.decisions[id] ?? null;
    const a = after.decisions[id];
    if (!a) continue;
    const changed =
      !b || b.status !== a.status || b.position !== a.position || b.assignedPin !== a.assignedPin || b.territoryId !== a.territoryId || b.rank !== a.rank || b.condition.length !== a.condition.length;
    if (!changed) continue;
    rows.push({
      id, name: names[id] ?? id, before: b, after: a, was: labelOf(b), now: labelOf(a), why: whyChanged(b, a),
      beforePin: b?.assignedPin ?? null, afterPin: a.assignedPin, beforeScore: b?.score ?? null, afterScore: a.score,
    });
  }
  rows.sort((x, y) => (x.id === first ? -1 : y.id === first ? 1 : 0));
  return rows;
}

export function withChange(input: RunInput, id: string, change: Change, provisional = false): RunInput {
  return { ...input, applications: input.applications.map((a) => (a.id === id ? applyChange(a, change, provisional) : a)) };
}

export interface Scenario {
  change: string;
  status: Status;
  score: number | null;
  /** Reads like "+₹6L → 78 → wins 570001 from APP-002 (75)". */
  text: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

function phrase(base: RunResult, after: Decision, id: string): string {
  if (HOLDS_OPENING.includes(after.status) && after.assignedPin) {
    const pin = after.assignedPin;
    const prev = Object.values(base.decisions).find((x) => x.id !== id && HOLDS_OPENING.includes(x.status) && x.assignedPin === pin);
    const verb = after.status === "redirected" ? "is redirected to" : "wins";
    return `${verb} ${pin}${prev ? ` from ${prev.id} (${prev.score ?? "no score"})` : ""}${after.status === "conditional" ? " with a condition" : ""}`;
  }
  return `${STATUS_LABEL[after.status].toLowerCase()}${after.status === "waiting" && after.position ? `, position ${after.position}` : ""}`;
}

/** Re-scores the applicant with one change at a time and reports the result. Nothing is guessed. */
export function scenariosFor(input: RunInput, id: string): Scenario[] {
  const base = run(input);
  const d = base.decisions[id];
  const app = input.applications.find((a) => a.id === id);
  if (!d || !app || d.status === "withdrawn") return [];
  const tries: { change: string; input: RunInput }[] = [];
  if (d.status === "redirected" && d.redirectPin) tries.push({ change: `a rented ground-floor space is found in ${d.redirectPin}`, input: withChange(input, id, { space: "Rented", size: 500, floor: "Ground" }) });
  else if (!d.hasSpace) tries.push({ change: "a rented ground-floor shop (500 sq ft) is found", input: withChange(input, id, { space: "Rented", size: 500, floor: "Ground" }) });
  if (d.setupCost !== null && app.investment !== null) {
    const min = (d.setupCost * base.assumptions.minInvestmentPctOfSetup) / 100;
    if (app.investment < min - 1e-9) tries.push({ change: `+₹${fmt(Math.round((min - app.investment) * 10) / 10)}L investment (to the ₹${fmt(min)}L minimum)`, input: withChange(input, id, { investment: min }) });
  }
  if (app.floor === "Upper") tries.push({ change: "the space moves to the ground floor", input: withChange(input, id, { floor: "Ground" }) });
  if ((app.experience ?? 0) < 3 && d.status !== "needs_info") tries.push({ change: "3 years of retail experience", input: withChange(input, id, { experience: 3 }) });
  // A competitor ahead of them withdraws.
  const ahead = d.ahead.length ? d.ahead[0] : d.competitors.find((c) => HOLDS_OPENING.includes(c.status))?.id;
  if (ahead && (d.status === "waiting" || d.status === "redirected")) {
    tries.push({ change: `${ahead} withdraws`, input: { ...input, applications: input.applications.map((a) => (a.id === ahead ? { ...a, withdrawn: true } : a)) } });
  }
  // The area gets one more opening.
  if (d.territoryId && (d.status === "waiting" || d.status === "redirected")) {
    tries.push({ change: `${d.territoryId} gets 1 more opening`, input: { ...input, territories: input.territories.map((t) => (t.id === d.territoryId ? { ...t, slots: t.slots + 1 } : t)) } });
  }
  const out: Scenario[] = [];
  for (const t of tries) {
    const r = run(t.input);
    const nd = r.decisions[id];
    if (!nd) continue;
    // A change that leaves status, pin and place in line exactly as they are tells the reader nothing.
    if (nd.status === d.status && nd.assignedPin === d.assignedPin && nd.redirectPin === d.redirectPin && nd.position === d.position && nd.rank === d.rank) continue;
    out.push({ change: t.change, status: nd.status, score: nd.score, text: `If ${t.change} → ${nd.score !== null ? `score ${nd.score} → ` : ""}${phrase(base, nd, id)}` });
  }
  return out;
}

/** One calculated answer to "what would change this?". */
export function whatWouldChange(input: RunInput, id: string): string {
  const base = run(input);
  const d = base.decisions[id];
  if (!d) return "Not available.";
  if (d.changedByTeam) return "The team changed this decision. Use Change this decision to undo it.";
  if (d.status === "withdrawn") return "Nothing. The applicant withdrew.";
  if (d.duplicateOf) return `Nothing needed. ${d.duplicateOf} is the application we are using.`;
  if (d.status === "needs_info") return `Answer this: ${d.ask}`;
  if (d.status === "not_in_plan") return "Only a change to the plan: the area would need to be added to the territories.";
  if (d.status === "not_eligible" && d.improvements.length) return `The two changes that add the most points: ${d.improvements.map((i) => `${i.change} (+${i.gain})`).join("; ")}.`;
  const sc = scenariosFor(input, id);
  if (sc.length) return sc.map((s) => s.text).join(". ") + ".";
  if (d.status === "approved") return "Nothing needed.";
  if (d.status === "conditional") return d.condition.map((c) => c.text.replace(/ within \d+ days\.?$/, "")).join(" and ") + " to move to Approved to proceed.";
  return "Nothing a single change would alter.";
}
