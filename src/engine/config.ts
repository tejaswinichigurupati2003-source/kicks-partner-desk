import type { Priority, Store, Tier } from "./types";

/**
 * Every number the engine uses. These are assumptions, not facts: the team can change them on the
 * Assumptions page and the engine re-runs. Defaults follow Kicks's current planning figures.
 */
export interface Assumptions {
  /** Setup cost by city size, ₹ lakh. */
  setupCost: Record<Tier, number>;
  /** Minimum investment as a share of setup cost, %. */
  minInvestmentPctOfSetup: number;
  /** How far below the minimum is still allowed with a condition, %. */
  investmentTolerancePct: number;
  /** Investment above this multiple of setup cost earns no extra points. */
  investmentCapRatio: number;
  /** Score weights. They add up to 100. */
  weights: { investment: number; space: number; experience: number; timeline: number; priority: number; completeness: number };
  /** Share of the territory-priority weight each priority earns. */
  priorityFactor: Record<Priority, number>;
  /** Share of the experience weight for 0, 1-2, 3-5 and 6+ years. */
  experienceShare: { none: number; low: number; mid: number; high: number };
  /** Most the business-background hint can add inside retail experience, points. */
  businessBonusMax: number;
  /** Share of the space weight for an owned and a rented space. */
  spaceShare: { owned: number; rented: number };
  floorFactor: { ground: number; mall: number; upper: number; unknown: number };
  /** Space size bands, sq ft. */
  sizeIdeal: [number, number];
  sizeNear: [number, number];
  sizeFactor: { ideal: number; near: number; other: number };
  /** Below this overall score nobody gets an opening. */
  minScoreToAllocate: number;
  /** Applicants with a usable space are placed before those without. */
  spaceReadyFirst: boolean;
  /** Stage lengths in weeks. */
  stageWeeks: { findSpace: number; siteApproval: number; agreement: number; fitOut: number; hiring: number; training: number; inventory: number; softLaunch: number };
  /** Days an opening is held for a condition. */
  conditionDays: number;
  /** Monthly sales by city size, ₹ lakh, and take-home share of sales. */
  monthlySales: Record<Tier, number>;
  takeHome: { rented: Record<Tier, number>; owned: Record<Tier, number> };
  /** Spread applied to monthly sales to give a payback range, %. */
  salesRangePct: number;
  earnBackTargetMonths: number;
  /** Training days by experience, and hours per training day. */
  trainingDays: { none: number; low: number; high: number };
  trainingHoursPerDay: number;
  /** A nearby existing store is flagged when its pin is this close numerically. */
  nearbyPinDistance: number;
  /** Bonus points added to a score to order the "Start here" list. */
  priorityBonus: Record<Priority, number>;
  shortlistSize: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  setupCost: { 1: 35, 2: 25, 3: 18 },
  minInvestmentPctOfSetup: 100,
  investmentTolerancePct: 10,
  investmentCapRatio: 1.2,
  weights: { investment: 25, space: 25, experience: 20, timeline: 10, priority: 10, completeness: 10 },
  priorityFactor: { High: 1, Medium: 0.6, Low: 0.3 },
  experienceShare: { none: 0, low: 0.4, mid: 0.75, high: 1 },
  businessBonusMax: 3,
  spaceShare: { owned: 1, rented: 0.8 },
  floorFactor: { ground: 1, mall: 1, upper: 0.7, unknown: 0.8 },
  sizeIdeal: [400, 800],
  sizeNear: [250, 1200],
  sizeFactor: { ideal: 1, near: 0.8, other: 0.5 },
  minScoreToAllocate: 45,
  spaceReadyFirst: true,
  stageWeeks: { findSpace: 9, siteApproval: 2, agreement: 2, fitOut: 4, hiring: 3, training: 2, inventory: 2, softLaunch: 1 },
  conditionDays: 30,
  monthlySales: { 1: 9, 2: 6, 3: 4 },
  takeHome: { rented: { 1: 0.15, 2: 0.15, 3: 0.16 }, owned: { 1: 0.23, 2: 0.23, 3: 0.24 } },
  salesRangePct: 20,
  earnBackTargetMonths: 30,
  trainingDays: { none: 14, low: 7, high: 3 },
  trainingHoursPerDay: 6,
  nearbyPinDistance: 10,
  priorityBonus: { High: 5, Medium: 2, Low: 0 },
  shortlistSize: 5,
};

/** Fills any missing value with its default, so older saved settings keep working. */
export function mergeAssumptions(partial?: Partial<Assumptions> | null): Assumptions {
  const d = DEFAULT_ASSUMPTIONS;
  const p = (partial ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    const given = p[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) out[k] = { ...(v as object), ...((given as object) ?? {}) };
    else out[k] = given === undefined ? v : given;
  }
  return out as unknown as Assumptions;
}

export const ASSUMPTION_SCHEMA_VERSION = 1;

/** Facts about the market that are not assumptions. */
export const CONFIG = {
  cities: {
    Bengaluru: { state: "Karnataka", prefix: "560", tier: 1 as Tier },
    Mysuru: { state: "Karnataka", prefix: "570", tier: 2 as Tier },
    Mangaluru: { state: "Karnataka", prefix: "575", tier: 2 as Tier },
    "Hubballi-Dharwad": { state: "Karnataka", prefix: "580", tier: 2 as Tier },
    Belagavi: { state: "Karnataka", prefix: "590", tier: 2 as Tier },
    Tumakuru: { state: "Karnataka", prefix: "572", tier: 3 as Tier },
    Davanagere: { state: "Karnataka", prefix: "577", tier: 3 as Tier },
  } as Record<string, { state: string; prefix: string; tier: Tier }>,
  cityAliases: {
    bangalore: "Bengaluru",
    bengaluru: "Bengaluru",
    bengalooru: "Bengaluru",
    mysore: "Mysuru",
    mangalore: "Mangaluru",
    hubli: "Hubballi-Dharwad",
    hubballi: "Hubballi-Dharwad",
    dharwad: "Hubballi-Dharwad",
    "hubli-dharwad": "Hubballi-Dharwad",
    "hubballi dharwad": "Hubballi-Dharwad",
    "hubli dharwad": "Hubballi-Dharwad",
    belgaum: "Belagavi",
    tumkur: "Tumakuru",
    davangere: "Davanagere",
  } as Record<string, string>,
  maxRows: 2000,
  // Defaults kept here for screens that only need the default value.
  conditionDays: DEFAULT_ASSUMPTIONS.conditionDays,
  priorityBonus: DEFAULT_ASSUMPTIONS.priorityBonus,
};

export const EXISTING_STORES: Store[] = [
  { id: "ST-01", city: "Bengaluru", pin: "560001", year: 2019 },
  { id: "ST-02", city: "Bengaluru", pin: "560034", year: 2020 },
  { id: "ST-03", city: "Bengaluru", pin: "560038", year: 2021 },
  { id: "ST-04", city: "Bengaluru", pin: "560066", year: 2022 },
  { id: "ST-05", city: "Bengaluru", pin: "560076", year: 2023 },
  { id: "ST-06", city: "Mysuru", pin: "570009", year: 2021 },
  { id: "ST-07", city: "Mysuru", pin: "570017", year: 2024 },
  { id: "ST-08", city: "Mangaluru", pin: "575001", year: 2022 },
  { id: "ST-09", city: "Hubballi-Dharwad", pin: "580020", year: 2023 },
  { id: "ST-10", city: "Belagavi", pin: "590001", year: 2024 },
];

export function canonicalCity(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  for (const name of Object.keys(CONFIG.cities)) if (name.toLowerCase() === t) return name;
  return CONFIG.cityAliases[t] ?? null;
}

export function cityForPin(pin: string): string | null {
  const prefix = pin.slice(0, 3);
  for (const [name, c] of Object.entries(CONFIG.cities)) if (c.prefix === prefix) return name;
  return null;
}

/** Weeks the whole chain of stages takes, in order, with overlaps counted once. */
export function chainWeeks(a: Assumptions, withFindSpace: boolean): number {
  const w = a.stageWeeks;
  return (withFindSpace ? w.findSpace : 0) + w.siteApproval + w.agreement + w.fitOut + Math.max(w.training, w.inventory) + w.softLaunch;
}

/** Earliest realistic launch in months from now. */
export function earliestMonths(a: Assumptions, hasSpace: boolean): number {
  return Math.round((chainWeeks(a, !hasSpace) / 4.345) * 10) / 10;
}
