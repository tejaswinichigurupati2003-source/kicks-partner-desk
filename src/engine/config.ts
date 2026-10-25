import type { Priority, Store, Tier } from "./types";

/** Kicks's current policy settings. Change numbers here, never inside the logic. */
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
    mysore: "Mysuru",
    mangalore: "Mangaluru",
    hubli: "Hubballi-Dharwad",
    hubballi: "Hubballi-Dharwad",
    dharwad: "Hubballi-Dharwad",
    "hubli-dharwad": "Hubballi-Dharwad",
    "hubballi dharwad": "Hubballi-Dharwad",
    belgaum: "Belagavi",
    tumkur: "Tumakuru",
    davangere: "Davanagere",
  } as Record<string, string>,
  setupCost: { 1: 35, 2: 25, 3: 18 } as Record<Tier, number>,
  minInvestmentShare: 0.6,
  maxInvestmentRatio: 1.2,
  monthlySales: { 1: 9, 2: 6, 3: 4 } as Record<Tier, number>,
  takeHome: {
    Rented: { 1: 0.15, 2: 0.15, 3: 0.16 } as Record<Tier, number>,
    Owned: { 1: 0.23, 2: 0.23, 3: 0.24 } as Record<Tier, number>,
  },
  earnBackTargetMonths: 30,
  weeksToOpenWithSpace: 10,
  earliestMonthsWithSpace: 2.5,
  earliestMonthsWithoutSpace: 4.5,
  conditionDays: 30,
  nearbyPinDistance: 10,
  priorityBonus: { High: 5, Medium: 2, Low: 0 } as Record<Priority, number>,
  shortlistSize: 5,
  maxRows: 2000,
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
