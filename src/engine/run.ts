import { CONFIG, DEFAULT_ASSUMPTIONS, canonicalCity, cityForPin, earliestMonths, mergeAssumptions, type Assumptions } from "./config";
import { readText } from "./text";
import type {
  Application,
  Competitor,
  Decision,
  Hint,
  Offer,
  Override,
  PinState,
  Priority,
  RunInput,
  RunResult,
  ScoreParts,
  Status,
  Store,
  Territory,
  TerritoryResult,
  Tier,
  TrailItem,
} from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(round1(n)));
const naturalCompare = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export const STATUS_LABEL: Record<Status, string> = {
  approved: "Approved to proceed",
  conditional: "Approved with a condition",
  redirected: "Redirected",
  waiting: "Waiting list",
  needs_info: "Needs information",
  not_in_plan: "Not in current plan",
  not_eligible: "Not eligible right now",
  withdrawn: "Withdrawn",
};

/** Statuses that take one of an area's openings. */
export const HOLDS_OPENING: Status[] = ["approved", "conditional", "redirected"];

export function hasSpace(a: Application): boolean {
  return (a.space === "Owned" || a.space === "Rented") && (a.size !== null || !!a.provisionalSize);
}

function sizeFactor(a: Application, asm: Assumptions): number {
  if (a.size === null) return asm.sizeFactor.near;
  const [lo, hi] = asm.sizeIdeal;
  const [nlo, nhi] = asm.sizeNear;
  if (a.size >= lo && a.size <= hi) return asm.sizeFactor.ideal;
  if (a.size >= nlo && a.size <= nhi) return asm.sizeFactor.near;
  return asm.sizeFactor.other;
}

function floorFactor(a: Application, asm: Assumptions): number {
  if (a.floor === "Ground") return asm.floorFactor.ground;
  if (a.floor === "Mall unit") return asm.floorFactor.mall;
  if (a.floor === "Upper") return asm.floorFactor.upper;
  return asm.floorFactor.unknown;
}

export function earnBackMonths(tier: Tier, space: "Owned" | "Rented", asm: Assumptions = DEFAULT_ASSUMPTIONS, salesScale = 1): number {
  return asm.setupCost[tier] / (asm.monthlySales[tier] * salesScale * asm.takeHome[space.toLowerCase() as "owned" | "rented"][tier]);
}

interface Ctx {
  asm: Assumptions;
  stores: Store[];
  storeByPin: Map<string, Store>;
  territoryByPin: Map<string, Territory>;
  hints: Record<string, Hint>;
}

interface Prep {
  app: Application;
  index: number;
  tier: Tier;
  territory: Territory | null;
  trail: TrailItem[];
  asks: string[];
  /** Set when an early check ends the story for this applicant. */
  early: { status: Status; verdict: string } | null;
  space: boolean;
  parts: ScoreParts | null;
  score: number | null;
  setup: number;
  minInvestment: number;
  moneyGap: number;
  relevance: "high" | "medium" | "low";
  businessBonus: number;
  earliest: number;
  suggestions: string[];
  storeHit: Store | null;
  improvements: { change: string; gain: number }[];
}

function pushTrail(t: TrailItem[], check: string, result: TrailItem["result"], detail: string) {
  t.push({ check, result, detail });
}

/** Points for every part of the score. Pure: used for the real score and for "what would change this". */
export function scoreParts(app: Application, ctx: { asm: Assumptions }, tier: Tier, territory: Territory | null, businessBonus: number, warnCount: number): ScoreParts {
  const { asm } = ctx;
  const w = asm.weights;
  const space = hasSpace(app);
  const setup = asm.setupCost[tier];
  const inv = app.investment ?? 0;
  const investment = (Math.min(inv / setup, asm.investmentCapRatio) / asm.investmentCapRatio) * w.investment;
  const exp = app.experience ?? 0;
  const share = exp < 1 ? asm.experienceShare.none : exp < 3 ? asm.experienceShare.low : exp < 6 ? asm.experienceShare.mid : asm.experienceShare.high;
  const experience = Math.min(w.experience, share * w.experience + businessBonus);
  const base = space ? (app.space === "Owned" ? asm.spaceShare.owned : asm.spaceShare.rented) * w.space : 0;
  const spacePts = space ? base * floorFactor(app, asm) * sizeFactor(app, asm) : 0;
  const earliest = earliestMonths(asm, space);
  const timeline = app.target === null ? w.timeline * 0.5 : app.target >= earliest ? w.timeline : Math.max(0, (w.timeline * app.target) / earliest);
  const priority = territory ? w.priority * asm.priorityFactor[territory.priority] : 0;
  const completeness = Math.max(0, w.completeness - 2 * (w.completeness / 10) * warnCount);
  return { investment, space: spacePts, experience, timeline, priority, completeness };
}

const sumParts = (p: ScoreParts) => p.investment + p.space + p.experience + p.timeline + p.priority + p.completeness;

function prepare(app: Application, index: number, ctx: Ctx): Prep {
  const { asm } = ctx;
  const trail: TrailItem[] = [];
  const asks: string[] = [];
  const pinOk = /^\d{6}$/.test(app.pin);
  const cityName = canonicalCity(app.city);
  const pinCity = pinOk ? cityForPin(app.pin) : null;
  const territory = pinOk ? (ctx.territoryByPin.get(app.pin) ?? null) : null;
  const space = hasSpace(app);
  const tier: Tier = territory?.tier ?? (pinCity ? CONFIG.cities[pinCity].tier : cityName ? CONFIG.cities[cityName].tier : 2);
  const setup = asm.setupCost[tier];
  const minInvestment = (setup * asm.minInvestmentPctOfSetup) / 100;
  const earliest = earliestMonths(asm, space);
  const storeHit = pinOk ? (ctx.storeByPin.get(app.pin) ?? null) : null;
  const base: Omit<Prep, "early"> = {
    app, index, tier, territory, trail, asks, space, parts: null, score: null, setup, minInvestment, moneyGap: 0,
    relevance: "low", businessBonus: 0, earliest, suggestions: [], storeHit, improvements: [],
  };
  const done = (status: Status, verdict: string): Prep => ({ ...base, early: { status, verdict } });

  if (app.withdrawn) {
    pushTrail(trail, "Application", "info", `Withdrawn${app.withdrawnReason ? `: ${app.withdrawnReason}` : ""}. It no longer competes for an opening.`);
    return done("withdrawn", "Withdrawn: this application no longer competes for an opening.");
  }

  // 1. Pin and city.
  let pinProblem: string | null = null;
  let outside = false;
  if (!pinOk) {
    pinProblem = "Please confirm the pin code.";
    pushTrail(trail, "Pin and city", "fail", `Pin code "${app.pin || "blank"}" is not 6 digits.`);
  } else if (cityName && pinCity && cityName === pinCity) {
    pushTrail(trail, "Pin and city", "pass", `Pin code ${app.pin} matches ${cityName}.`);
  } else if (!cityName && !pinCity) {
    outside = true;
    pushTrail(trail, "Pin and city", "info", `${app.city || "The city"} and pin code ${app.pin} are outside the seven cities we are opening in.`);
  } else {
    pinProblem = "The pin code and city don't match. Which is correct?";
    pushTrail(trail, "Pin and city", "fail", `Pin code ${app.pin} belongs to ${pinCity ?? "no city we serve"}, but the city given is ${app.city || "blank"}.`);
  }
  if (pinProblem) {
    asks.push(pinProblem);
    return { ...done("needs_info", `Needs information: ${pinProblem}`), asks };
  }
  if (outside) {
    pushTrail(trail, "Territory", "fail", "Not in any area of the current plan.");
    return done("not_in_plan", `Not in current plan: ${app.city || "this city"} is outside the cities we are opening in.`);
  }
  if (!territory) {
    pushTrail(trail, "Territory", "fail", `Pin code ${app.pin} is not in any area of the current plan.`);
    return done("not_in_plan", `Not in current plan: pin code ${app.pin} is not in any area we are opening in right now.`);
  }
  pushTrail(trail, "Territory", "pass", `Pin code ${app.pin} is in ${territory.id} (${territory.city}, Tier ${territory.tier}, ${territory.priority} priority, ${territory.slots} openings).`);

  // 2. Required answers.
  const missing: string[] = [];
  if (app.space === null) {
    asks.push("Do you already have a shop space: owned, rented, or not yet identified?");
    missing.push("shop space");
  }
  if ((app.space === "Owned" || app.space === "Rented") && app.size === null && !app.provisionalSize) {
    asks.push("What is the size of the space in sq ft?");
    missing.push("space size");
  }
  if (app.investment === null || app.investmentProblem) {
    asks.push("How much can you invest, in ₹ lakh?");
    missing.push("investment");
  }
  if (app.experience === null || app.experienceProblem) {
    asks.push("How many years have you run or managed a shop? Please write 0 if none.");
    missing.push("retail experience");
  }
  if (missing.length) {
    pushTrail(trail, "Required answers", "fail", `Missing or unclear: ${missing.join(", ")}.`);
    return { ...done("needs_info", `Needs information: ${asks[0]}`), asks };
  }
  pushTrail(trail, "Required answers", "pass", "Every required answer is present.");

  // 3. Space details agree with each other.
  const warns: TrailItem[] = [];
  if (app.space === "Not yet identified" && (app.size !== null || (app.floor && app.floor !== "Not known"))) {
    warns.push({ check: "Space details", result: "warn", detail: "Space is marked 'Not yet identified' but a size or floor is given. Treated as no space yet; please confirm." });
  } else if (space && (app.floor === "Not known" || app.floor === null)) {
    warns.push({ check: "Space details", result: "warn", detail: "The floor of the space is not known. Scored as unknown." });
  } else pushTrail(trail, "Space details", "pass", space ? `${app.space} space, ${app.floor?.toLowerCase()}, ${app.size !== null ? `${fmt(app.size)} sq ft` : "size to be confirmed"}.` : "No space yet, and no conflicting space details.");

  // 4. Existing store at this pin.
  if (storeHit) pushTrail(trail, "Existing store", "fail", `Kicks already has store ${storeHit.id} at pin code ${app.pin}. We never open two stores in one pin code.`);
  else pushTrail(trail, "Existing store", "pass", `No Kicks store at pin code ${app.pin}.`);

  // 5. Investment: pass, pass with a condition, or not eligible.
  const inv = app.investment ?? 0;
  const gapPct = ((minInvestment - inv) / minInvestment) * 100;
  const gapLakh = round1(minInvestment - inv);
  let moneyGap = 0;
  if (inv >= minInvestment - 1e-9) {
    pushTrail(trail, "Investment", "pass", `₹${fmt(inv)} lakh available vs ₹${fmt(minInvestment)} lakh minimum for a Tier ${tier} store (${round1(((inv - minInvestment) / minInvestment) * 100)}% above).`);
  } else if (gapPct <= asm.investmentTolerancePct + 1e-9) {
    moneyGap = gapLakh;
    pushTrail(trail, "Investment", "warn", `₹${fmt(inv)} lakh is ${round1(gapPct)}% below the ₹${fmt(minInvestment)} lakh minimum. Within the ${asm.investmentTolerancePct}% tolerance, so approval carries a condition: show ₹${fmt(gapLakh)} lakh more.`);
  } else {
    pushTrail(trail, "Investment", "fail", `₹${fmt(inv)} lakh is ${round1(gapPct)}% below the ₹${fmt(minInvestment)} lakh minimum, further than the ${asm.investmentTolerancePct}% tolerance.`);
  }

  // 6. Timeline.
  if (app.target === null) warns.push({ check: "Timeline", result: "warn", detail: "Target launch was not provided." });
  else if (app.target < earliest) warns.push({ check: "Timeline", result: "warn", detail: `Target launch of ${fmt(app.target)} month(s) is earlier than the realistic ${fmt(earliest)} months${space ? "" : " without a space"}. Realistic launch shown instead.` });
  else pushTrail(trail, "Timeline", "pass", `A target of ${fmt(app.target)} months is realistic (earliest ${fmt(earliest)}).`);

  // 7. What the notes say.
  const text = readText(app, ctx.hints[app.id]);
  if (text.instruction) warns.push({ check: "Notes", result: "warn", detail: "The notes contain instructions that were ignored." });
  for (const c of text.contradictions) warns.push({ check: "Notes", result: "warn", detail: c });
  for (const s of text.suggestions) pushTrail(trail, "Notes", "info", `Suggested update to confirm: ${s}`);

  for (const w of warns) trail.push(w);
  const parts = scoreParts(app, ctx, tier, territory, 0, warns.length);
  const bonusMax = asm.businessBonusMax;
  const businessBonus = text.business === "high" ? bonusMax : text.business === "medium" ? bonusMax / 2 : 0;
  const finalParts = businessBonus > 0 ? scoreParts(app, ctx, tier, territory, businessBonus, warns.length) : parts;
  const score = sumParts(finalParts);
  pushTrail(trail, "Score", "info", `Score ${fmt(round1(score))} out of 100: investment ${fmt(round1(finalParts.investment))}/${asm.weights.investment}, space ${fmt(round1(finalParts.space))}/${asm.weights.space}, experience ${fmt(round1(finalParts.experience))}/${asm.weights.experience}${businessBonus ? ` (includes +${fmt(businessBonus)} for business background)` : ""}, timeline ${fmt(round1(finalParts.timeline))}/${asm.weights.timeline}, area priority ${fmt(round1(finalParts.priority))}/${asm.weights.priority}, complete application ${fmt(round1(finalParts.completeness))}/${asm.weights.completeness}.`);

  const full: Prep = { ...base, parts: finalParts, score, moneyGap, relevance: text.business, businessBonus, suggestions: text.suggestions, early: null };

  if (inv < minInvestment - 1e-9 && gapPct > asm.investmentTolerancePct + 1e-9) {
    return { ...full, early: { status: "not_eligible", verdict: `Not eligible right now: ₹${fmt(inv)} lakh is ${round1(gapPct)}% below the ₹${fmt(minInvestment)} lakh minimum (tolerance ${asm.investmentTolerancePct}%).` } };
  }
  if (score < asm.minScoreToAllocate) {
    const improvements = improvementsFor(full, ctx);
    pushTrail(trail, "Minimum score", "fail", `Score ${fmt(round1(score))} is below the minimum of ${asm.minScoreToAllocate} needed to get an opening.`);
    return { ...full, improvements, early: { status: "not_eligible", verdict: `Not eligible: overall fit too low (score ${fmt(round1(score))}, minimum ${asm.minScoreToAllocate}).` } };
  }
  pushTrail(trail, "Minimum score", "pass", `Score ${fmt(round1(score))} is above the minimum of ${asm.minScoreToAllocate}.`);
  return full;
}

/** The two single changes that would add the most points to a low score. */
function improvementsFor(p: Prep, ctx: Ctx): { change: string; gain: number }[] {
  const { app, tier, territory } = p;
  const warnCount = p.trail.filter((t) => t.result === "warn").length;
  const base = sumParts(scoreParts(app, ctx, tier, territory, p.businessBonus, warnCount));
  const tries: { change: string; app: Application; warns?: number }[] = [];
  if (!hasSpace(app)) tries.push({ change: "Find a rented ground-floor shop of 400 to 800 sq ft", app: { ...app, space: "Rented", size: 500, floor: "Ground" } });
  if (app.space === "Rented" && hasSpace(app)) tries.push({ change: "Own the space instead of renting", app: { ...app, space: "Owned" } });
  if (app.floor === "Upper") tries.push({ change: "Move to a ground-floor or mall space", app: { ...app, floor: "Ground" } });
  if ((app.investment ?? 0) < p.setup * ctx.asm.investmentCapRatio) tries.push({ change: `Raise the investment to ₹${fmt(p.setup)} lakh`, app: { ...app, investment: Math.max(p.setup, app.investment ?? 0) } });
  if ((app.experience ?? 0) < 3) tries.push({ change: "Have 3 or more years of retail experience", app: { ...app, experience: 3 } });
  if (app.target !== null && app.target < p.earliest) tries.push({ change: `Plan for a launch at ${fmt(p.earliest)} months or later`, app: { ...app, target: p.earliest }, warns: Math.max(0, warnCount - 1) });
  return tries
    .map((t) => ({ change: t.change, gain: round1(sumParts(scoreParts(t.app, ctx, tier, territory, p.businessBonus, t.warns ?? warnCount)) - base) }))
    .filter((t) => t.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 2);
}

function nextStepFor(status: Status, d: { redirectPin: string | null; requestedPin: string; storeHit: boolean; hadSpace: boolean; ask?: string; conditions: Decision["condition"]; offers: Offer[] }): string {
  switch (status) {
    case "approved":
      return "Send ID and address proof, then get ready for the site visit and financial checks.";
    case "conditional":
      return d.conditions[0]?.text ?? "Meet the condition within the time given.";
    case "redirected":
      return d.storeHit && d.hadSpace
        ? `Your space can't be used at pin code ${d.requestedPin} (we already have a store there). You'll need a space in pin code ${d.redirectPin}. Reply to accept it.`
        : `Reply to accept pin code ${d.redirectPin}${d.hadSpace ? "" : " and start looking for a space there"}.`;
    case "needs_info":
      return d.ask ?? "Reply with the missing detail.";
    case "waiting":
      return d.offers.length ? `Wait for an opening, or consider ${d.offers[0].city} (pin codes ${d.offers[0].pins.slice(0, 2).join(", ")}).` : "Wait for an opening. We'll tell you as soon as one comes up.";
    case "not_in_plan":
      return "No action right now. We'll contact you if we start opening in your area.";
    case "withdrawn":
      return "No action needed.";
    default:
      return "No action right now.";
  }
}

function blankDecision(p: Prep, status: Status, verdict: string): Decision {
  const rounded = p.parts
    ? ({
        investment: round1(p.parts.investment), space: round1(p.parts.space), experience: round1(p.parts.experience),
        timeline: round1(p.parts.timeline), priority: round1(p.parts.priority), completeness: round1(p.parts.completeness),
      } as ScoreParts)
    : null;
  return {
    id: p.app.id, status, verdict, reasonTrail: p.trail, reasons: [], checks: [], suggestions: p.suggestions,
    score: p.score === null ? null : round1(p.score), parts: rounded, territoryId: p.territory?.id ?? null,
    rank: null, position: null, ahead: [], offers: [], condition: [], earnBack: null, nearbyStore: null,
    duplicateOf: null, tier: p.tier, setupCost: p.setup, hasSpace: p.space, earliestMonths: p.earliest,
    assignedPin: null, redirectPin: null, tieBreak: null, competitors: [], improvements: p.improvements,
    businessBonus: p.businessBonus, changedByTeam: null, engineStatus: status, business: p.relevance, nextStep: "",
  };
}

function conditionsFor(p: Prep, asm: Assumptions, extraSpacePin?: string): Decision["condition"] {
  const out: Decision["condition"] = [];
  if (!p.space) out.push({ kind: "space", text: `Find and send us a shop space${extraSpacePin ? ` in pin code ${extraSpacePin}` : ""} within ${asm.conditionDays} days.` });
  else if (extraSpacePin) out.push({ kind: "space", text: `Find and send us a shop space in pin code ${extraSpacePin} within ${asm.conditionDays} days.` });
  if (p.space && p.app.floor === "Upper" && !extraSpacePin)
    out.push({ kind: "floor", text: `Show how you will bring in walk-in customers to an upper-floor shop, or send a ground-floor option, within ${asm.conditionDays} days.` });
  if (p.moneyGap > 0) out.push({ kind: "funding", text: `Show ₹${fmt(p.moneyGap)} lakh more (a loan or your own funds) within ${asm.conditionDays} days.` });
  return out;
}

export function freePinsOf(t: Territory, taken: Set<string>): string[] {
  return t.pins.filter((p) => !taken.has(p));
}

function nearestPin(candidates: string[], requested: string): string | null {
  const r = parseInt(requested, 10);
  const sorted = [...candidates].sort((a, b) => Math.abs(parseInt(a, 10) - r) - Math.abs(parseInt(b, 10) - r) || parseInt(a, 10) - parseInt(b, 10));
  return sorted[0] ?? null;
}

type TieKey = "space readiness" | "investment points" | "space points" | "completeness" | "row order";

export function run(input: RunInput): RunResult {
  const asm = mergeAssumptions(input.assumptions);
  const { applications, territories, stores } = input;
  const overrides: Record<string, Override> = input.overrides ?? {};
  const problems: string[] = [];

  const storeByPin = new Map(stores.map((s) => [s.pin, s]));
  const territoryByPin = new Map<string, Territory>();
  for (const t of territories) for (const p of t.pins) if (!territoryByPin.has(p)) territoryByPin.set(p, t);
  const ctx: Ctx = { asm, stores, storeByPin, territoryByPin, hints: input.hints ?? {} };

  const preps = applications.map((a, i) => prepare(a, i, ctx));
  const prepById = new Map(preps.map((p) => [p.app.id, p]));
  const decisions: Record<string, Decision> = {};

  // Same name and same pin in two applications: keep the stronger one.
  const dupOf = new Map<string, string>();
  const byKey = new Map<string, Prep[]>();
  for (const p of preps) {
    if (!p.app.name || !p.app.pin || p.app.withdrawn) continue;
    const key = `${p.app.name.toLowerCase()}|${p.app.pin}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index);
    for (const loser of sorted.slice(1)) dupOf.set(loser.app.id, sorted[0].app.id);
  }

  const competing = new Map<string, Prep[]>();
  const forced = new Set<string>();

  for (const p of preps) {
    const id = p.app.id;
    const ov = overrides[id];
    if (dupOf.has(id)) {
      const d = blankDecision(p, "not_eligible", `Not eligible right now: duplicate of ${dupOf.get(id)}.`);
      d.duplicateOf = dupOf.get(id)!;
      pushTrail(d.reasonTrail, "Duplicate", "fail", `${d.duplicateOf} has the same name and pin code ${p.app.pin} and the stronger application.`);
      decisions[id] = d;
      continue;
    }
    if (p.early) {
      const d = blankDecision(p, p.early.status, p.early.verdict);
      if (p.early.status === "needs_info") d.ask = p.asks[0];
      decisions[id] = d;
      continue;
    }
    if (!p.territory) continue;
    if (ov && !HOLDS_OPENING.includes(ov.status)) {
      pushTrail(p.trail, "Team decision", "info", `The team moved this application out of the running: ${ov.reason}`);
      continue; // decision is built after allocation as a team-changed result
    }
    if (ov) forced.add(id);
    competing.set(p.territory.id, [...(competing.get(p.territory.id) ?? []), p]);
  }

  const territoryResults: TerritoryResult[] = [];
  const takenPins = new Set(stores.map((s) => s.pin));
  const holders = new Map<string, string>(); // pin -> applicant who holds it (approved or redirected)
  const allocation = new Map<string, { kind: "approved" | "redirected" | "waiting" | "store_none"; pin?: string; position?: number; ahead?: string[]; why: string }>();
  const rankMeta = new Map<string, { rank: number; of: number }>();

  const usableSpace = (p: Prep) => p.space && !p.storeHit;
  const keyOrder: { key: TieKey; get: (p: Prep) => number }[] = [
    { key: "space readiness", get: (p) => (usableSpace(p) ? 1 : 0) },
    { key: "space points", get: (p) => p.parts?.space ?? 0 },
    { key: "investment points", get: (p) => p.parts?.investment ?? 0 },
    { key: "completeness", get: (p) => p.parts?.completeness ?? 0 },
  ];
  const compare = (a: Prep, b: Prep): number => {
    if (forced.has(a.app.id) !== forced.has(b.app.id)) return forced.has(a.app.id) ? -1 : 1;
    if (asm.spaceReadyFirst && usableSpace(a) !== usableSpace(b)) return usableSpace(a) ? -1 : 1;
    const d = (b.score ?? 0) - (a.score ?? 0);
    if (Math.abs(d) > 1e-9) return d;
    if (!asm.spaceReadyFirst && usableSpace(a) !== usableSpace(b)) return usableSpace(a) ? -1 : 1;
    for (const k of keyOrder.slice(1)) {
      const x = k.get(b) - k.get(a);
      if (Math.abs(x) > 1e-9) return x;
    }
    return a.index - b.index;
  };
  const deciding = (a: Prep, b: Prep): TieKey => {
    if (!asm.spaceReadyFirst && usableSpace(a) !== usableSpace(b)) return "space readiness";
    for (const k of keyOrder.slice(1)) if (Math.abs(k.get(b) - k.get(a)) > 1e-9) return k.key;
    return "row order";
  };

  const orderedTerritories = [...territories].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || naturalCompare(a.id, b.id));
  for (const t of orderedTerritories) {
    const group = [...(competing.get(t.id) ?? [])].sort(compare);
    let left = t.slots;
    const approvedHere: string[] = [];
    const redirectedHere: string[] = [];
    const waitingHere: string[] = [];
    group.forEach((p, i) => rankMeta.set(p.app.id, { rank: i + 1, of: group.length }));

    // A tie on score is written into the trail of both applicants.
    for (let i = 0; i + 1 < group.length; i++) {
      const a = group[i];
      const b = group[i + 1];
      if (forced.has(a.app.id) || forced.has(b.app.id)) continue;
      if (usableSpace(a) !== usableSpace(b) && asm.spaceReadyFirst) continue;
      if (Math.abs((a.score ?? 0) - (b.score ?? 0)) <= 1e-9) {
        const key = deciding(a, b);
        a.trail.push({ check: "Tie-break", result: "info", detail: `Tied on score ${fmt(round1(a.score ?? 0))} with ${b.app.id}; ${key} decided, so ${a.app.id} ranks ahead.` });
        b.trail.push({ check: "Tie-break", result: "info", detail: `Tied on score ${fmt(round1(b.score ?? 0))} with ${a.app.id}; ${key} decided, so ${a.app.id} ranks ahead.` });
      }
    }

    group.forEach((p, i) => {
      const req = p.app.pin;
      const storeHit = !!p.storeHit;
      const heldBy = holders.get(req);
      const later = group.slice(i + 1);
      const reserved = new Set(later.filter((q) => usableSpace(q)).map((q) => q.app.pin));

      if (!storeHit && !heldBy) {
        if (left > 0) {
          takenPins.add(req);
          holders.set(req, p.app.id);
          left -= 1;
          approvedHere.push(p.app.id);
          allocation.set(p.app.id, { kind: "approved", pin: req, why: `Ranked ${i + 1} of ${group.length} in ${t.id}, which has ${t.slots} opening(s). Pin code ${req} was free, so it is allocated.` });
        } else {
          const position = waitingHere.length + 1;
          allocation.set(p.app.id, { kind: "waiting", position, ahead: [...approvedHere, ...redirectedHere, ...waitingHere], why: t.slots === 0 ? `${t.id} has no openings at the moment.` : `All ${t.slots} opening(s) in ${t.id} went to applicants who ranked higher.` });
          waitingHere.push(p.app.id);
        }
        return;
      }

      // The pin they asked for is not available.
      const canRedirect = storeHit || !p.space;
      if (canRedirect) {
        const free = t.pins.filter((x) => !takenPins.has(x) && !holders.has(x) && !reserved.has(x) && x !== req);
        const pick = nearestPin(free, req);
        if (pick && left > 0) {
          takenPins.add(pick);
          holders.set(pick, p.app.id);
          left -= 1;
          redirectedHere.push(p.app.id);
          const lostWhy = storeHit ? `Kicks already has a store at pin code ${req}` : `${heldBy} ranked higher for pin code ${req}`;
          allocation.set(p.app.id, { kind: "redirected", pin: pick, why: `${lostWhy}. ${t.id} has a free pin code and an opening, so pin code ${pick} (nearest to ${req}) is offered. This uses one opening, in rank order.` });
          return;
        }
        if (storeHit) {
          allocation.set(p.app.id, { kind: "store_none", why: `Kicks already has a store at pin code ${req} and ${t.id} has no free pin code with an opening to offer instead.` });
          return;
        }
      }
      const position = waitingHere.length + 1;
      allocation.set(p.app.id, {
        kind: "waiting", position, ahead: [...approvedHere, ...redirectedHere, ...waitingHere],
        why: `${heldBy ?? "Another applicant"} ranked higher for pin code ${req}, and we open only one store per pin code.${p.space ? " Your space is in that pin code, so you stay on the waiting list instead of being redirected." : " No free pin code with an opening was left to offer."}`,
      });
      waitingHere.push(p.app.id);
    });

    territoryResults.push({ territory: t, approved: approvedHere, redirected: redirectedHere, waiting: waitingHere, applicants: group.map((p) => p.app.id), openingsLeft: left, freePins: [], pins: [] });
  }
  for (const r of territoryResults) r.freePins = r.territory.pins.filter((x) => !takenPins.has(x) && !holders.has(x));

  // Pin board states.
  const requestersByPin = new Map<string, string[]>();
  for (const group of competing.values()) for (const p of group) requestersByPin.set(p.app.pin, [...(requestersByPin.get(p.app.pin) ?? []), p.app.id]);
  for (const r of territoryResults) {
    r.pins = r.territory.pins.map((pin) => {
      const reqs = requestersByPin.get(pin) ?? [];
      const holder = holders.get(pin);
      let state: PinState = "free";
      let by: string[] = [];
      if (storeByPin.has(pin)) {
        state = "store";
        by = [storeByPin.get(pin)!.id];
      } else if (reqs.length >= 2) {
        state = "contested";
        by = reqs;
      } else if (holder && allocation.get(holder)?.kind === "approved") {
        state = "allocated";
        by = [holder];
      } else if (holder && allocation.get(holder)?.kind === "redirected") {
        state = "redirected";
        by = [holder];
      }
      return { pin, state, by };
    });
  }

  function offersFor(p: Prep): Offer[] {
    const city = canonicalCity(p.app.city) ?? cityForPin(p.app.pin) ?? "";
    const sorted = territoryResults
      .filter((r) => r.openingsLeft > 0 && r.freePins.some((x) => x !== p.app.pin))
      .sort((a, b) => {
        const sameT = (r: TerritoryResult) => (p.territory && r.territory.id === p.territory.id ? 0 : 1);
        const sameC = (r: TerritoryResult) => (r.territory.city === city ? 0 : 1);
        const sameTier = (r: TerritoryResult) => (r.territory.tier === p.tier ? 0 : 1);
        return sameT(a) - sameT(b) || sameC(a) - sameC(b) || sameTier(a) - sameTier(b) || PRIORITY_RANK[a.territory.priority] - PRIORITY_RANK[b.territory.priority] || naturalCompare(a.territory.id, b.territory.id);
      });
    return sorted.slice(0, 4).map((r) => ({
      territoryId: r.territory.id, city: r.territory.city, pins: r.freePins.filter((x) => x !== p.app.pin).slice(0, 4),
      openingsLeft: r.openingsLeft, priority: r.territory.priority, sameCity: r.territory.city === city,
    }));
  }

  function nearby(p: Prep): string | null {
    const pin = parseInt(p.app.pin, 10);
    if (Number.isNaN(pin)) return null;
    const city = canonicalCity(p.app.city);
    const hit = stores
      .filter((s) => (canonicalCity(s.city) ?? s.city) === city && s.pin !== p.app.pin && Math.abs(parseInt(s.pin, 10) - pin) <= asm.nearbyPinDistance)
      .sort((a, b) => Math.abs(parseInt(a.pin, 10) - pin) - Math.abs(parseInt(b.pin, 10) - pin))[0];
    return hit ? `${hit.id} (pin code ${hit.pin})` : null;
  }

  function earnBackOf(p: Prep): Decision["earnBack"] {
    const type = p.app.space === "Owned" && p.space ? "Owned" : "Rented";
    const months = earnBackMonths(p.tier, type, asm);
    const low = earnBackMonths(p.tier, type, asm, 1 + asm.salesRangePct / 100);
    const high = earnBackMonths(p.tier, type, asm, 1 - asm.salesRangePct / 100);
    return { months: Math.round(months), low: Math.round(low), high: Math.round(high), slow: months > asm.earnBackTargetMonths, assumedRented: !(p.app.space === "Owned" && p.space) && !(p.app.space === "Rented" && p.space) };
  }

  for (const p of preps) {
    const id = p.app.id;
    if (decisions[id]) continue;
    const territory = p.territory;
    if (!territory) continue;
    const alloc = allocation.get(id);
    const meta = rankMeta.get(id);
    let d: Decision;
    if (alloc?.kind === "approved") {
      const conds = conditionsFor(p, asm);
      d = blankDecision(p, conds.length ? "conditional" : "approved", conds.length ? `Approved with a condition: opening at pin code ${alloc.pin} held for ${asm.conditionDays} days.` : `Approved: gets an opening at pin code ${alloc.pin} in ${p.app.city} (${territory.id}).`);
      d.condition = conds;
      d.assignedPin = alloc.pin ?? null;
      pushTrail(d.reasonTrail, "Allocation", "pass", alloc.why);
      for (const c of conds) pushTrail(d.reasonTrail, "Condition", "warn", c.text);
    } else if (alloc?.kind === "redirected") {
      const conds = conditionsFor(p, asm, alloc.pin);
      d = blankDecision(p, "redirected", `Redirected: pin code ${p.app.pin} isn't available, so pin code ${alloc.pin} is offered in ${territory.id}.`);
      d.redirectPin = alloc.pin ?? null;
      d.assignedPin = alloc.pin ?? null;
      d.condition = conds;
      pushTrail(d.reasonTrail, "Allocation", "info", alloc.why);
    } else if (alloc?.kind === "store_none") {
      d = blankDecision(p, "not_eligible", "Not eligible right now: we already have a store in this pin code and no other pin code is free.");
      pushTrail(d.reasonTrail, "Allocation", "fail", alloc.why);
      d.offers = offersFor(p);
    } else {
      d = blankDecision(p, "waiting", `Waiting list: position ${alloc?.position ?? 1} for ${territory.id}.`);
      d.position = alloc?.position ?? 1;
      d.ahead = alloc?.ahead ?? [];
      pushTrail(d.reasonTrail, "Allocation", "fail", alloc?.why ?? "Waiting for an opening.");
      d.offers = offersFor(p);
    }
    d.rank = meta?.rank ?? null;
    d.earnBack = earnBackOf(p);
    d.nearbyStore = nearby(p);
    if (d.nearbyStore) pushTrail(d.reasonTrail, "Nearby store", "warn", `May take customers from our nearby store ${d.nearbyStore}.`);
    if (d.earnBack?.slow) pushTrail(d.reasonTrail, "Payback", "warn", `Takes about ${d.earnBack.months} months to earn back, longer than our ${asm.earnBackTargetMonths}-month target.`);
    const tie = p.trail.find((t) => t.check === "Tie-break");
    d.tieBreak = tie ? tie.detail : null;
    decisions[id] = d;
  }

  // Someone the team moved out of the running still needs a decision to show.
  for (const p of preps) {
    const id = p.app.id;
    if (decisions[id] || !p.territory) continue;
    const d = blankDecision(p, "waiting", "Moved by the team.");
    d.earnBack = earnBackOf(p);
    decisions[id] = d;
  }

  // Competitors for the same pin.
  for (const [pin, ids] of requestersByPin) {
    for (const id of ids) {
      const d = decisions[id];
      if (!d) continue;
      d.competitors = ids.filter((x) => x !== id).map((x): Competitor => ({ id: x, score: decisions[x]?.score ?? null, status: decisions[x]?.status ?? "waiting", pin }));
    }
  }

  // Team changes.
  for (const [id, ov] of Object.entries(overrides)) {
    const d = decisions[id];
    if (!d) continue;
    d.engineStatus = d.status;
    const holds = HOLDS_OPENING.includes(d.status);
    const applied = holds ? d.status === ov.status || forced.has(id) : !HOLDS_OPENING.includes(ov.status);
    if (applied) {
      d.status = ov.status;
      d.changedByTeam = { status: ov.status, reason: ov.reason };
      d.verdict = `${STATUS_LABEL[ov.status]}: changed by the team.`;
      pushTrail(d.reasonTrail, "Team decision", "info", `The team changed this decision to ${STATUS_LABEL[ov.status]}. Reason: ${ov.reason}`);
    }
  }

  // Derive plain sentences and next steps from the trail.
  for (const p of preps) {
    const d = decisions[p.app.id];
    if (!d) continue;
    d.reasons = d.reasonTrail.map((t) => t.detail);
    d.checks = d.reasonTrail.filter((t) => t.result === "warn").map((t) => t.detail);
    d.nextStep = nextStepFor(d.status, {
      redirectPin: d.redirectPin, requestedPin: p.app.pin, storeHit: !!p.storeHit, hadSpace: p.space, ask: d.ask, conditions: d.condition, offers: d.offers,
    });
  }

  // Hard rules: one store per pin code, openings never exceeded.
  const seen = new Map<string, string>();
  for (const [id, d] of Object.entries(decisions)) {
    if (!HOLDS_OPENING.includes(d.status) || d.changedByTeam) continue;
    const pin = d.assignedPin;
    if (!pin) continue;
    if (storeByPin.has(pin)) problems.push(`${id} was given pin code ${pin}, which already has a store.`);
    if (seen.has(pin)) problems.push(`${id} and ${seen.get(pin)} were both given pin code ${pin}.`);
    seen.set(pin, id);
  }
  for (const r of territoryResults) if (r.approved.length + r.redirected.length > r.territory.slots) problems.push(`${r.territory.id} has more approvals than openings.`);

  // Shortlist.
  const bonus = (id: string) => {
    const t = prepById.get(id)?.territory;
    return t ? asm.priorityBonus[t.priority] : 0;
  };
  const shortlist = Object.values(decisions)
    .filter((d) => (d.status === "approved" || d.status === "conditional") && d.score !== null)
    .map((d) => ({ id: d.id, value: round1((d.score ?? 0) + bonus(d.id)) }))
    .sort((a, b) => b.value - a.value || naturalCompare(a.id, b.id))
    .slice(0, asm.shortlistSize);

  return { decisions, order: applications.map((a) => a.id), territories: territoryResults.map((r) => ({ ...r })), shortlist, problems, assumptions: asm };
}
