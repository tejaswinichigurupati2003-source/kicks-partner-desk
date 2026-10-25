import { run, STATUS_LABEL } from "./run";
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
}

function label(d: Decision | null): string {
  if (!d) return "New";
  return d.status === "waiting" && d.position ? `${STATUS_LABEL[d.status]} (position ${d.position})` : STATUS_LABEL[d.status];
}

function whyChanged(before: Decision | null, after: Decision, names: Record<string, string>): string {
  if (!before) return "New application.";
  if (after.status === "approved" || after.status === "conditional") {
    if (before.status === "waiting") return "An opening or pin code became available to this applicant.";
    return after.verdict;
  }
  if (after.status === "waiting") return after.reasons[0] ?? after.verdict;
  void names;
  return after.verdict;
}

/** Who changed between two runs: status, or place on the waiting list. */
export function diff(before: RunResult, after: RunResult, names: Record<string, string>, first?: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const id of after.order) {
    const b = before.decisions[id] ?? null;
    const a = after.decisions[id];
    if (!a) continue;
    const changed = !b || b.status !== a.status || b.position !== a.position || b.territoryId !== a.territoryId || (b.condition.length !== a.condition.length);
    if (!changed) continue;
    rows.push({ id, name: names[id] ?? id, before: b, after: a, was: label(b), now: label(a), why: whyChanged(b, a, names) });
  }
  rows.sort((x, y) => (x.id === first ? -1 : y.id === first ? 1 : 0));
  return rows;
}

export function withChange(input: RunInput, id: string, change: Change, provisional = false): RunInput {
  return { ...input, applications: input.applications.map((a) => (a.id === id ? applyChange(a, change, provisional) : a)) };
}

const ok = (s: Status) => s === "approved" || s === "conditional";

/** The smallest change that gives this applicant a different result, found by re-running the rules. */
export function whatWouldChange(input: RunInput, id: string): string {
  const base = run(input);
  const d = base.decisions[id];
  const app = input.applications.find((a) => a.id === id);
  if (!d || !app) return "Not available.";
  if (d.changedByTeam) return "The team changed this decision. Use Change this decision to undo it.";
  if (d.duplicateOf) return `Nothing needed. ${d.duplicateOf} is the application we are using.`;
  if (d.status === "approved") return "Nothing needed.";
  if (d.status === "conditional") {
    return d.condition.map((c) => c.text.replace(/ within \d+ days\.?$/, "")).join(" and ") + ` — done within ${30} days to move to Approved to proceed.`;
  }
  if (d.status === "needs_info") return `Answer this: ${d.ask}`;

  const territory = base.territories.find((t) => t.territory.id === d.territoryId);
  const tries: { text: string; change: Change }[] = [];
  if (d.status === "not_eligible" && d.reasons[0]?.includes("already has a store") && territory) {
    const free = territory.freePins.slice(0, 3);
    return free.length ? `Apply for a different pin code in ${territory.territory.id}, such as ${free.join(", ")}.` : "No free pin code is left in this area. Another area would be needed.";
  }
  if (d.status === "not_eligible" && d.setupCost) {
    const need = Math.round(d.setupCost * 0.6 * 10) / 10;
    return `An investment of ₹${need} lakh or more (60% of ₹${d.setupCost} lakh) would make this application eligible.`;
  }
  if (!d.hasSpace) tries.push({ text: "Finding a ground-floor shop of 400 to 800 sq ft (rented or owned)", change: { space: "Rented", size: 500, floor: "Ground" } });
  if (app.floor === "Upper") tries.push({ text: "Moving to a ground-floor or mall space", change: { floor: "Ground" } });
  if (app.floor === "Not known" && d.hasSpace) tries.push({ text: "Confirming the space is on the ground floor", change: { floor: "Ground" } });
  if (d.setupCost && (app.investment ?? 0) < d.setupCost) tries.push({ text: `Raising the investment to ₹${d.setupCost} lakh`, change: { investment: d.setupCost } });
  if (d.hasSpace && app.space === "Rented") tries.push({ text: "Owning the space instead of renting", change: { space: "Owned" } });
  if ((app.experience ?? 0) < 3) tries.push({ text: "Having 3 or more years of retail experience", change: { experience: 3 } });
  if (d.tier !== null && territory) {
    for (const pin of territory.freePins.slice(0, 2)) tries.push({ text: `Applying for pin code ${pin} instead, which is still free`, change: { pin } });
  }
  for (const t of tries) {
    const r = run(withChange(input, id, t.change));
    const nd = r.decisions[id];
    if (nd && ok(nd.status)) return `${t.text} would move this applicant to ${STATUS_LABEL[nd.status]}.`;
  }
  if (d.status === "waiting" && d.offers.length) return "Accepting one of the other areas on offer, or waiting for an applicant ahead to drop out.";
  return "Waiting for an applicant ahead to drop out, or for more openings in this area.";
}
