import { CONFIG } from "./config";
import type { Application, Decision, Language } from "./types";

export type StageStatus = "Not started" | "In progress" | "Done" | "Stuck";
export const STAGE_STATUSES: StageStatus[] = ["Not started", "In progress", "Done", "Stuck"];

export interface Stage {
  key: string;
  n: number;
  name: string;
  from: number;
  to: number;
  owner: string;
  what: string;
}

export const STAGES: Stage[] = [
  { key: "s1", n: 1, name: "Offer and documents", from: 0, to: 1, owner: "Partner and expansion team", what: "ID and address proof, application form." },
  { key: "s2", n: 2, name: "Site visit", from: 1, to: 3, owner: "Expansion team", what: "Footfall, shop front, visibility from the road, nearby shoe shops. If rented: the landlord's written consent." },
  { key: "s3", n: 3, name: "Financial verification", from: 1, to: 4, owner: "Finance", what: "Bank statements, tax returns, source of funds, proof of the investment." },
  { key: "s4", n: 4, name: "Checks before we sign", from: 2, to: 5, owner: "Legal", what: "Police verification certificate and credit check. Owned shop: ownership papers and revenue records. Rented: agreement and lock-in period. Shop registration, trade licence and GST applied for (Legal confirms the current list for the city)." },
  { key: "s5", n: 5, name: "Franchise agreement", from: 5, to: 6, owner: "Legal", what: "Signed after the site visit, financial verification and checks are clear. Franchise fee paid." },
  { key: "s6", n: 6, name: "Shop fit-out and branding", from: 6, to: 9, owner: "Store design team", what: "Shop layout, racks and display, trial seating, signage." },
  { key: "s7", n: 7, name: "Training", from: 6, to: 9, owner: "Training team", what: "The store manager and sales staff are hired and trained." },
  { key: "s8", n: 8, name: "Stock and systems", from: 8, to: 10, owner: "Supply and IT", what: "Billing and stock software; opening stock ordered from the warehouse and delivered." },
  { key: "s9", n: 9, name: "Opening", from: 9, to: 10, owner: "Partner with Kicks", what: "Opening checklist signed off; first-week support visit booked." },
];

export const STAGE_ZERO: Stage = {
  key: "s0",
  n: 0,
  name: "Find and send us a space",
  from: 0,
  to: CONFIG.conditionDays / 7,
  owner: "Partner",
  what: `Find a shop space and send its details within ${CONFIG.conditionDays} days. The 10 weeks start after that.`,
};

export function stagesFor(d: Decision): Stage[] {
  return d.condition.some((c) => c.kind === "space") ? [STAGE_ZERO, ...STAGES] : STAGES;
}

export const KICKS_MODULES = [
  "Product ranges and sizing",
  "Fitting customers",
  "Display and arranging stock",
  "Billing and stock software",
  "Returns and exchanges",
  "Customer service",
  "Brand standards",
  "Licences and tax registration",
  "Hiring and managing staff",
];

export interface TrainingPlan {
  programme: string;
  duration: string;
  language: Language;
  basics: string[];
  focus: { module: string; why: string }[];
  modules: string[];
}

export function trainingPlan(a: Application, d: Decision): TrainingPlan {
  const exp = a.experience ?? 0;
  let programme: string;
  let duration: string;
  let basics: string[] = [];
  if (exp < 1) {
    programme = "Full programme for first-time shop owners";
    duration = "2 weeks, including 3 days working in an existing Kicks store";
    basics = ["Shop basics", "Daily cash handling"];
  } else if (exp < 3) {
    programme = "Standard programme";
    duration = "1 week";
  } else {
    programme = "Kicks modules only";
    duration = "3 days";
  }
  const focus: { module: string; why: string }[] = [];
  if (exp < 1) focus.push({ module: "Daily cash handling", why: "No shop experience yet." }, { module: "Hiring and managing staff", why: "First time managing a team." });
  if (!d.hasSpace) focus.push({ module: "Choosing the right shop", why: "No space found yet. Ground floor, 400 to 800 sq ft does best." });
  if (a.floor === "Upper") focus.push({ module: "Attracting walk-in customers", why: "Upper-floor shops get less street traffic." });
  if (d.business !== "high") focus.push({ module: "Product ranges and sizing", why: "No footwear or similar retail background. Extra practice on sizes and ranges." }, { module: "Fitting customers", why: "Extra practice on fitting." });
  if (exp < 3) focus.push({ module: "Billing and stock software", why: "Needed from the first day." });
  const seen = new Set<string>();
  const unique = focus.filter((f) => (seen.has(f.module) ? false : (seen.add(f.module), true)));
  return { programme, duration, language: a.language, basics, focus: unique, modules: KICKS_MODULES };
}

export interface LaunchCheck {
  expected: Date;
  target: Date | null;
  weeksLate: number;
  text: string;
  ok: boolean;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + Math.round(days));
  return x;
}

export function launchCheck(a: Application, d: Decision, now: Date): LaunchCheck {
  const months = d.hasSpace ? CONFIG.earliestMonthsWithSpace : CONFIG.earliestMonthsWithoutSpace;
  const expected = addDays(now, months * 30.4);
  const target = a.target !== null ? addDays(now, a.target * 30.4) : null;
  const fmt = (x: Date) => x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (!target) return { expected, target, weeksLate: 0, ok: true, text: `Expected opening around ${fmt(expected)}. No target launch was given.` };
  const weeksLate = Math.max(0, Math.round((expected.getTime() - target.getTime()) / (7 * 86400000)));
  if (weeksLate === 0) return { expected, target, weeksLate, ok: true, text: `The target of ${fmt(target)} looks realistic. Earliest opening: ${fmt(expected)}.` };
  return {
    expected,
    target,
    weeksLate,
    ok: false,
    text: `The target of ${fmt(target)} is about ${weeksLate} week(s) too early. Earliest realistic opening: ${fmt(expected)}${d.hasSpace ? "" : ", because a space still has to be found"}.`,
  };
}

export function stageWindow(approvedOn: Date, stage: Stage, withStageZero: boolean): { start: Date; end: Date } {
  const offset = withStageZero ? CONFIG.conditionDays : 0;
  if (stage.n === 0) return { start: approvedOn, end: addDays(approvedOn, CONFIG.conditionDays) };
  return { start: addDays(approvedOn, offset + stage.from * 7), end: addDays(approvedOn, offset + stage.to * 7) };
}
