import { CONFIG, canonicalCity, cityForPin } from "./config";
import { businessRelevance, readNotes } from "./text";
import type {
  Application,
  Decision,
  Offer,
  Override,
  Priority,
  RunInput,
  RunResult,
  ScoreParts,
  Status,
  Store,
  Territory,
  TerritoryResult,
  Tier,
} from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(round1(n)));
const naturalCompare = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function hasSpace(a: Application): boolean {
  return (a.space === "Owned" || a.space === "Rented") && (a.size !== null || !!a.provisionalSize);
}

function sizeFactor(a: Application): number {
  if (a.size === null) return 0.8;
  if (a.size >= 400 && a.size <= 800) return 1;
  if ((a.size >= 250 && a.size < 400) || (a.size > 800 && a.size <= 1200)) return 0.8;
  return 0.5;
}

function floorFactor(a: Application): number {
  if (a.floor === "Ground" || a.floor === "Mall unit") return 1;
  if (a.floor === "Upper") return 0.7;
  return 0.8;
}

export function earnBackMonths(tier: Tier, space: "Owned" | "Rented"): number {
  return CONFIG.setupCost[tier] / (CONFIG.monthlySales[tier] * CONFIG.takeHome[space][tier]);
}

interface Prep {
  app: Application;
  tier: Tier;
  territory: Territory | null;
  asks: string[];
  checks: string[];
  notes: string[];
  suggestions: string[];
  space: boolean;
  parts: ScoreParts | null;
  score: number | null;
  setup: number;
  relevance: "high" | "medium" | "low";
  earliest: number;
}

function prepare(app: Application, territoryByPin: Map<string, Territory>): Prep {
  const asks: string[] = [];
  const checks: string[] = [];
  const notes: string[] = [];
  const pinOk = /^\d{6}$/.test(app.pin);
  const pinCity = pinOk ? cityForPin(app.pin) : null;
  const territory = pinOk ? (territoryByPin.get(app.pin) ?? null) : null;
  const cityName = canonicalCity(app.city);

  if (!pinOk) asks.push("Please confirm the pin code.");
  else if (!pinCity || !cityName || pinCity !== cityName) asks.push("The pin code and city don't match. Which is correct?");

  const spaceKnown = app.space !== null;
  if (!spaceKnown) asks.push("Do you already have a shop space: owned, rented, or not yet identified?");
  if ((app.space === "Owned" || app.space === "Rented") && app.size === null && !app.provisionalSize)
    asks.push("What is the size of the space in sq ft?");
  if (app.investment === null || app.investmentProblem === "negative" || app.investmentProblem === "not a number" || app.investmentProblem === "blank")
    asks.push("How much can you invest, in ₹ lakh?");
  if (app.experience === null || app.experienceProblem)
    asks.push("How many years have you run or managed a shop? Please write 0 if none.");

  const tier: Tier = territory?.tier ?? (pinCity ? CONFIG.cities[pinCity].tier : cityName ? CONFIG.cities[cityName].tier : 2);
  const space = hasSpace(app);

  if (app.space === "Not yet identified" && (app.size !== null || (app.floor && app.floor !== "Not known" && app.floor !== null))) {
    checks.push("Space is marked 'Not yet identified' but a size or floor is given. Treated as no space yet; please confirm.");
  }
  if (space && (app.floor === "Not known" || app.floor === null)) checks.push("The floor of the space is not known. Scored as unknown.");

  const found = readNotes(app);
  for (const c of found.contradictions) checks.push(c);
  if (found.instruction) checks.push("The notes contain instructions that were ignored.");

  const earliest = space ? CONFIG.earliestMonthsWithSpace : CONFIG.earliestMonthsWithoutSpace;
  if (app.target !== null && app.target < earliest)
    checks.push(`Target launch of ${fmt(app.target)} month(s) is earlier than the realistic ${fmt(earliest)} months${space ? "" : " without a space"}. Realistic launch shown instead.`);
  if (app.target === null) checks.push("Target launch was not provided.");

  const relevance = businessRelevance(app);
  const setup = CONFIG.setupCost[tier];

  let parts: ScoreParts | null = null;
  let score: number | null = null;
  if (asks.length === 0) {
    const inv = app.investment ?? 0;
    const exp = app.experience ?? 0;
    const investment = (Math.min(inv / setup, CONFIG.maxInvestmentRatio) / CONFIG.maxInvestmentRatio) * 25;
    const experience = exp < 1 ? 0 : exp < 3 ? 8 : exp < 6 ? 15 : 20;
    const base = app.space === "Owned" && space ? 25 : app.space === "Rented" && space ? 20 : 0;
    const spacePts = space ? base * floorFactor(app) * sizeFactor(app) : 0;
    const launch = app.target === null ? 5 : app.target >= earliest ? 10 : Math.max(0, (10 * app.target) / earliest);
    const business = relevance === "high" ? 10 : relevance === "medium" ? 6 : 2;
    const complete = Math.max(0, 10 - 2 * checks.length);
    parts = { investment, experience, space: spacePts, launch, business, complete };
    score = investment + experience + spacePts + launch + business + complete;
  }
  return { app, tier, territory, asks, checks, notes, suggestions: found.suggestions, space, parts, score, setup, relevance, earliest };
}

function compare(a: Prep, b: Prep): number {
  if (a.space !== b.space) return a.space ? -1 : 1;
  const d = (b.score ?? 0) - (a.score ?? 0);
  if (Math.abs(d) > 1e-9) return d;
  const sp = (b.parts?.space ?? 0) - (a.parts?.space ?? 0);
  if (Math.abs(sp) > 1e-9) return sp;
  const ip = (b.parts?.investment ?? 0) - (a.parts?.investment ?? 0);
  if (Math.abs(ip) > 1e-9) return ip;
  const ta = a.app.target ?? Infinity;
  const tb = b.app.target ?? Infinity;
  if (ta !== tb) return ta - tb;
  return naturalCompare(a.app.id, b.app.id);
}

function blankDecision(p: Prep, status: Status): Decision {
  const roundedParts = p.parts
    ? ({
        investment: round1(p.parts.investment),
        experience: round1(p.parts.experience),
        space: round1(p.parts.space),
        launch: round1(p.parts.launch),
        business: round1(p.parts.business),
        complete: round1(p.parts.complete),
      } as ScoreParts)
    : null;
  const spaceType = p.app.space === "Owned" ? "Owned" : "Rented";
  const months = p.asks.length === 0 || p.parts ? earnBackMonths(p.tier, spaceType) : null;
  return {
    id: p.app.id,
    status,
    verdict: "",
    reasons: [],
    checks: [...p.checks, ...p.notes],
    suggestions: p.suggestions,
    score: p.score === null ? null : round1(p.score),
    parts: roundedParts,
    territoryId: p.territory?.id ?? null,
    rank: null,
    position: null,
    ahead: [],
    offers: [],
    condition: [],
    earnBack:
      months === null || !p.parts
        ? null
        : { months: Math.round(months), slow: months > CONFIG.earnBackTargetMonths, assumedRented: !(p.app.space === "Owned" && p.space) && !(p.app.space === "Rented" && p.space) },
    nearbyStore: null,
    duplicateOf: null,
    tier: p.tier,
    setupCost: p.setup,
    hasSpace: p.space,
    earliestMonths: p.earliest,
    changedByTeam: null,
    engineStatus: status,
    business: p.relevance,
  };
}

function spaceLine(a: Application): string {
  if (!hasSpace(a)) return "No shop space yet.";
  const floor = a.floor && a.floor !== "Not known" ? `${a.floor.toLowerCase()} ${a.floor === "Mall unit" ? "" : "floor"}`.trim() : "floor not known";
  return `${a.space} space, ${floor}, ${a.size !== null ? `${fmt(a.size)} sq ft` : "size not given yet"}.`;
}

function conditionsFor(p: Prep): Decision["condition"] {
  const out: Decision["condition"] = [];
  if (!p.space) out.push({ kind: "space", text: `Find and send us a shop space within ${CONFIG.conditionDays} days.` });
  if (p.space && p.app.floor === "Upper")
    out.push({ kind: "floor", text: `Show how you will bring in walk-in customers to an upper-floor shop, or send a ground-floor option, within ${CONFIG.conditionDays} days.` });
  const gap = p.setup - (p.app.investment ?? 0);
  if (gap > 0.0001)
    out.push({ kind: "funding", text: `Show proof of the extra ₹${fmt(round1(gap))} lakh (a loan or your own funds) within ${CONFIG.conditionDays} days.` });
  return out;
}

export function freePinsOf(t: Territory, taken: Set<string>): string[] {
  return t.pins.filter((p) => !taken.has(p));
}

export function run(input: RunInput): RunResult {
  const { applications, territories, stores } = input;
  const overrides: Record<string, Override> = input.overrides ?? {};
  const problems: string[] = [];

  const storePins = new Set(stores.map((s: Store) => s.pin));
  const territoryByPin = new Map<string, Territory>();
  for (const t of territories) for (const p of t.pins) if (!territoryByPin.has(p)) territoryByPin.set(p, t);

  const preps = applications.map((a) => prepare(a, territoryByPin));
  const prepById = new Map(preps.map((p) => [p.app.id, p]));
  const decisions: Record<string, Decision> = {};

  // Same name and same pin in two applications: keep the stronger one.
  const dupOf = new Map<string, string>();
  const byKey = new Map<string, Prep[]>();
  for (const p of preps) {
    if (!p.app.name || !p.app.pin) continue;
    const key = `${p.app.name.toLowerCase()}|${p.app.pin}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || naturalCompare(a.app.id, b.app.id));
    for (const loser of sorted.slice(1)) dupOf.set(loser.app.id, sorted[0].app.id);
  }

  const competing = new Map<string, Prep[]>(); // territory id -> applicants
  const forced = new Set<string>();
  const finalNotes = new Map<string, string>();
  const outside: Prep[] = [];
  const taken = new Set(storePins);

  for (const p of preps) {
    const id = p.app.id;
    const ov = overrides[id];
    if (dupOf.has(id)) {
      const d = blankDecision(p, "not_eligible");
      d.duplicateOf = dupOf.get(id)!;
      d.verdict = `Not eligible right now: duplicate of ${d.duplicateOf}.`;
      d.reasons = [`${d.duplicateOf} has the same name and pin code ${p.app.pin} and the stronger application.`];
      decisions[id] = d;
      continue;
    }
    if (p.asks.length > 0) {
      const d = blankDecision(p, "needs_info");
      d.ask = p.asks[0];
      d.verdict = `Needs information: ${p.asks[0]}`;
      d.reasons = p.asks.map((q) => `Missing or unclear answer: ${q}`);
      decisions[id] = d;
      continue;
    }
    if (storePins.has(p.app.pin)) {
      const d = blankDecision(p, "not_eligible");
      d.verdict = "Not eligible right now: we already have a store in this pin code.";
      d.reasons = [`Kicks already has a store at pin code ${p.app.pin}. We never open two stores in the same pin code.`];
      decisions[id] = d;
      continue;
    }
    if (!p.territory) {
      outside.push(p);
      continue;
    }
    if ((p.app.investment ?? 0) < CONFIG.minInvestmentShare * p.setup) {
      const d = blankDecision(p, "not_eligible");
      const min = round1(CONFIG.minInvestmentShare * p.setup);
      d.verdict = `Not eligible right now: ₹${fmt(p.app.investment ?? 0)} lakh is below the ₹${fmt(min)} lakh minimum.`;
      d.reasons = [
        `₹${fmt(p.app.investment ?? 0)} lakh available vs ₹${fmt(p.setup)} lakh needed to open a Tier ${p.tier} store.`,
        `We need at least ${CONFIG.minInvestmentShare * 100}% of the setup cost (₹${fmt(min)} lakh).`,
      ];
      decisions[id] = d;
      continue;
    }
    if (ov && ov.status !== "approved" && ov.status !== "conditional") {
      // The team took this applicant out of the running; the opening is released.
      finalNotes.set(id, ov.reason);
    } else {
      if (ov) forced.add(id);
      competing.set(p.territory.id, [...(competing.get(p.territory.id) ?? []), p]);
    }
  }

  const territoryResults: TerritoryResult[] = [];
  const approvedIds = new Set<string>();
  const waitingMeta = new Map<string, { territory: Territory; position: number; ahead: string[]; reason: string }>();
  const rankMeta = new Map<string, { rank: number; of: number }>();

  const orderedTerritories = [...territories].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || naturalCompare(a.id, b.id));
  for (const t of orderedTerritories) {
    const group = [...(competing.get(t.id) ?? [])].sort((a, b) => {
      const fa = forced.has(a.app.id);
      const fb = forced.has(b.app.id);
      if (fa !== fb) return fa ? -1 : 1;
      return compare(a, b);
    });
    let left = t.slots;
    const approvedHere: string[] = [];
    const waitingHere: string[] = [];
    group.forEach((p, i) => rankMeta.set(p.app.id, { rank: i + 1, of: group.length }));
    for (const p of group) {
      const pinTaken = taken.has(p.app.pin);
      if (!pinTaken && left > 0) {
        taken.add(p.app.pin);
        left -= 1;
        approvedHere.push(p.app.id);
        approvedIds.add(p.app.id);
      } else {
        const holder = pinTaken ? approvedHere.concat([...approvedIds]).find((x) => prepById.get(x)?.app.pin === p.app.pin) : undefined;
        const position = waitingHere.length + 1;
        const ahead = [...approvedHere, ...waitingHere];
        waitingHere.push(p.app.id);
        waitingMeta.set(p.app.id, {
          territory: t,
          position,
          ahead,
          reason: pinTaken
            ? `Another applicant${holder ? ` (${holder})` : ""} ranked higher for pin code ${p.app.pin}, and we open only one store per pin code.`
            : t.slots === 0
              ? `${t.id} has no openings at the moment.`
              : `All ${t.slots} opening(s) in ${t.id} went to applicants who ranked higher.`,
        });
      }
    }
    territoryResults.push({ territory: t, approved: approvedHere, waiting: waitingHere, applicants: group.map((p) => p.app.id), openingsLeft: left, freePins: [] });
  }
  for (const r of territoryResults) r.freePins = freePinsOf(r.territory, taken);
  const resultByTerritory = new Map(territoryResults.map((r) => [r.territory.id, r]));

  // Offers: other free pins in the same area, then areas in the same city, then the same city size.
  function offersFor(p: Prep): Offer[] {
    const city = canonicalCity(p.app.city) ?? (cityForPin(p.app.pin) ?? "");
    const candidates = territoryResults.filter((r) => r.openingsLeft > 0 && r.freePins.length > 0 && r.freePins.some((x) => x !== p.app.pin));
    const sorted = [...candidates].sort((a, b) => {
      const sameT = (r: TerritoryResult) => (p.territory && r.territory.id === p.territory.id ? 0 : 1);
      const sameC = (r: TerritoryResult) => (r.territory.city === city ? 0 : 1);
      const sameTier = (r: TerritoryResult) => (r.territory.tier === p.tier ? 0 : 1);
      return (
        sameT(a) - sameT(b) ||
        sameC(a) - sameC(b) ||
        sameTier(a) - sameTier(b) ||
        PRIORITY_RANK[a.territory.priority] - PRIORITY_RANK[b.territory.priority] ||
        naturalCompare(a.territory.id, b.territory.id)
      );
    });
    return sorted.slice(0, 4).map((r) => ({
      territoryId: r.territory.id,
      city: r.territory.city,
      pins: r.freePins.filter((x) => x !== p.app.pin).slice(0, 4),
      openingsLeft: r.openingsLeft,
      priority: r.territory.priority,
      sameCity: r.territory.city === city,
    }));
  }

  function nearby(p: Prep): string | null {
    const pin = parseInt(p.app.pin, 10);
    if (Number.isNaN(pin)) return null;
    const city = canonicalCity(p.app.city);
    const hit = stores
      .filter((s) => (canonicalCity(s.city) ?? s.city) === city && s.pin !== p.app.pin && Math.abs(parseInt(s.pin, 10) - pin) <= CONFIG.nearbyPinDistance)
      .sort((a, b) => Math.abs(parseInt(a.pin, 10) - pin) - Math.abs(parseInt(b.pin, 10) - pin))[0];
    return hit ? `${hit.id} (pin code ${hit.pin})` : null;
  }

  // Build decisions for everyone who competed or was redirected.
  for (const p of preps) {
    const id = p.app.id;
    if (decisions[id]) continue;
    const territory = p.territory;
    if (!territory) {
      const d = blankDecision(p, "not_eligible");
      d.offers = offersFor(p);
      const sameCity = d.offers.some((o) => o.sameCity);
      if (sameCity) {
        d.status = "waiting";
        d.engineStatus = "waiting";
        d.verdict = `Waiting list: we aren't opening at pin code ${p.app.pin} right now, but other areas in ${p.app.city} have openings.`;
        d.reasons = [`Pin code ${p.app.pin} is not in any area we are opening in at the moment.`, `${d.offers.filter((o) => o.sameCity).length} other area(s) in ${p.app.city} still have openings.`];
      } else {
        d.offers = [];
        d.verdict = "Not eligible right now: we aren't opening at this pin code at the moment.";
        d.reasons = [`Pin code ${p.app.pin} is not in any area we are opening in right now, and no other area in ${p.app.city} has openings left.`];
      }
      decisions[id] = d;
      continue;
    }

    const rm = rankMeta.get(id);
    const wm = waitingMeta.get(id);
    const common = [
      `₹${fmt(p.app.investment ?? 0)} lakh available vs ₹${fmt(p.setup)} lakh needed to open a Tier ${p.tier} store.`,
      spaceLine(p.app),
      `Score ${fmt(round1(p.score ?? 0))} out of 100.`,
    ];

    if (approvedIds.has(id)) {
      const conds = conditionsFor(p);
      const d = blankDecision(p, conds.length ? "conditional" : "approved");
      d.condition = conds;
      d.rank = rm?.rank ?? null;
      const open = `Ranked ${rm?.rank} of ${rm?.of} applicant(s) in ${territory.id}, which has ${territory.slots} opening(s).`;
      d.reasons = [open, ...common];
      if (conds.length) {
        d.verdict = `Approved with a condition: opening at pin code ${p.app.pin} held for ${CONFIG.conditionDays} days.`;
        d.reasons.push(...conds.map((c) => `Condition: ${c.text}`));
      } else d.verdict = `Approved: gets an opening at pin code ${p.app.pin} in ${p.app.city} (${territory.id}).`;
      decisions[id] = d;
    } else if (wm) {
      const d = blankDecision(p, "waiting");
      d.rank = rm?.rank ?? null;
      d.position = wm.position;
      d.ahead = wm.ahead;
      d.verdict = `Waiting list: position ${wm.position} for ${territory.id}.`;
      d.reasons = [wm.reason, ...common];
      d.offers = offersFor(p);
      decisions[id] = d;
    } else {
      // Taken out of the running by the team.
      const d = blankDecision(p, "waiting");
      d.verdict = "Changed by the team.";
      d.reasons = common;
      decisions[id] = d;
    }
    const d = decisions[id];
    if (p.parts) {
      if (p.setup > (p.app.investment ?? 0) + 0.0001) d.checks.unshift(`Needs a loan or extra funds of ₹${fmt(round1(p.setup - (p.app.investment ?? 0)))} lakh.`);
      if (d.earnBack?.slow) d.checks.push("Takes longer than our 30-month target to earn back.");
    }
    d.nearbyStore = nearby(p);
    if (d.nearbyStore) d.checks.push(`May take customers from our nearby store ${d.nearbyStore}.`);
  }

  // Offers for not-eligible applicants whose pin already has a store.
  for (const p of preps) {
    const d = decisions[p.app.id];
    if (d && d.status === "not_eligible" && !d.duplicateOf && storePins.has(p.app.pin) && p.asks.length === 0) {
      d.offers = offersFor(p);
      d.nearbyStore = nearby(p);
    }
  }

  // Team changes.
  for (const [id, ov] of Object.entries(overrides)) {
    const d = decisions[id];
    if (!d) continue;
    d.engineStatus = d.status;
    const sameAsEngine = d.status === ov.status;
    const applied = approvedIds.has(id) ? sameAsEngine || forced.has(id) : ov.status !== "approved" && ov.status !== "conditional";
    if (applied) {
      d.status = ov.status;
      d.changedByTeam = { status: ov.status, reason: ov.reason };
      d.verdict = `${STATUS_LABEL[ov.status]}: changed by the team.`;
      d.reasons = [`Team decision: ${ov.reason}`, ...d.reasons.filter((r) => !r.startsWith("Team decision"))];
    }
  }

  // Waiting-list members left with a verdict of "Changed by the team" are only those the team moved.
  for (const d of Object.values(decisions)) if (d.status === "waiting" && d.verdict === "Changed by the team.") d.verdict = "Waiting list: moved by the team.";

  // Hard rules.
  const seenPins = new Map<string, string>();
  for (const id of approvedIds) {
    const pin = prepById.get(id)!.app.pin;
    if (storePins.has(pin)) problems.push(`${id} was approved at pin code ${pin}, which already has a store.`);
    if (seenPins.has(pin)) problems.push(`${id} and ${seenPins.get(pin)} were both approved at pin code ${pin}.`);
    seenPins.set(pin, id);
  }
  for (const r of territoryResults) if (r.approved.length > r.territory.slots) problems.push(`${r.territory.id} has more approvals than openings.`);

  // Shortlist.
  const bonus = (id: string) => {
    const t = prepById.get(id)?.territory;
    return t ? CONFIG.priorityBonus[t.priority] : 0;
  };
  const live = Object.values(decisions).filter((d) => (d.status === "approved" || d.status === "conditional") && d.score !== null);
  const shortlist = live
    .map((d) => ({ id: d.id, value: round1((d.score ?? 0) + bonus(d.id)) }))
    .sort((a, b) => b.value - a.value || naturalCompare(a.id, b.id))
    .slice(0, CONFIG.shortlistSize);

  return {
    decisions,
    order: applications.map((a) => a.id),
    territories: territoryResults.map((r) => resultByTerritory.get(r.territory.id)!),
    shortlist,
    problems,
  };
}

export const STATUS_LABEL: Record<Status, string> = {
  approved: "Approved to proceed",
  conditional: "Approved with a condition",
  needs_info: "Needs information",
  waiting: "Waiting list",
  not_eligible: "Not eligible right now",
};
