import { CONFIG, canonicalCity } from "./config";
import type { Application, Floor, Language, Priority, Space, Store, Territory, Tier } from "./types";

export type Cell = string | number | boolean | null | undefined;
export type RawRow = Record<string, Cell>;

const s = (v: Cell): string => (v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " "));

export function cleanPin(v: Cell): string {
  let t = s(v).replace(/\s/g, "");
  if (/^\d+\.0+$/.test(t)) t = t.split(".")[0];
  return t;
}

/** Reads a number from a cell. Problem text is set for blank, negative or unreadable values. */
export function parseNumber(v: Cell): { value: number | null; problem?: string } {
  if (v === null || v === undefined || s(v) === "") return { value: null, problem: "blank" };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { value: null, problem: "not a number" };
    return v < 0 ? { value: v, problem: "negative" } : { value: v };
  }
  const t = s(v).toLowerCase().replace(/,/g, "");
  const m = t.match(/-?\d+(\.\d+)?/);
  if (!m) return { value: null, problem: "not a number" };
  let n = parseFloat(m[0]);
  if (/crore|\bcr\b/.test(t)) n *= 100;
  if (n < 0) return { value: n, problem: "negative" };
  return { value: n };
}

function pick<T extends string>(v: Cell, options: readonly T[]): T | null {
  const t = s(v).toLowerCase();
  if (!t) return null;
  for (const o of options) if (o.toLowerCase() === t) return o;
  return null;
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Finds a column by the start of its header, ignoring case and punctuation. */
export function keyOf(row: RawRow, ...names: string[]): Cell {
  const keys = Object.keys(row);
  for (const n of names) {
    const hit = keys.find((k) => norm(k).startsWith(norm(n)));
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

/** Splits "Mysuru · Karnataka" into city and state when they come in one cell. */
function splitCityState(cityCell: Cell, stateCell: Cell): { city: string; state: string } {
  let city = s(cityCell);
  let state = s(stateCell);
  if (!state && /[·•,]/.test(city)) {
    const parts = city.split(/\s*[·•,]\s*/);
    if (parts.length >= 2) {
      city = parts[0];
      state = parts[1];
    }
  }
  return { city: canonicalCity(city) ?? city, state };
}

export function cleanApplication(row: RawRow): Application {
  const { city, state } = splitCityState(keyOf(row, "City"), keyOf(row, "State"));
  const inv = parseNumber(keyOf(row, "Investment"));
  const exp = parseNumber(keyOf(row, "Retail experience", "Experience"));
  const size = parseNumber(keyOf(row, "Space size", "Size"));
  const target = parseNumber(keyOf(row, "Target launch", "Target"));
  const language = pick(keyOf(row, "Preferred language", "Language"), ["Kannada", "English", "Hindi"] as const) ?? "English";
  return {
    id: s(keyOf(row, "Application ID", "ID")),
    name: s(keyOf(row, "Applicant name", "Name")),
    city,
    state,
    pin: cleanPin(keyOf(row, "Pin code", "Pin")),
    investment: inv.value,
    investmentProblem: inv.problem,
    experience: exp.value,
    experienceProblem: exp.problem,
    business: s(keyOf(row, "Current / past business", "Current", "Business")),
    space: pick<Space>(keyOf(row, "Space available", "Space avail"), ["Owned", "Rented", "Not yet identified"]),
    size: size.value !== null && size.value >= 0 ? size.value : null,
    floor: pick<Floor>(keyOf(row, "Floor"), ["Ground", "Upper", "Mall unit", "Not known"]),
    target: target.value,
    language: language as Language,
    notes: s(keyOf(row, "Notes from applicant", "Notes")),
  };
}

export function cleanTerritory(row: RawRow): Territory {
  const { city, state } = splitCityState(keyOf(row, "City"), keyOf(row, "State"));
  const pins = Array.from(
    new Set(
      s(keyOf(row, "Pin codes covered", "Pin codes"))
        .split(/[,;\s]+/)
        .map((p) => cleanPin(p))
        .filter(Boolean),
    ),
  );
  const tierNum = parseInt(s(keyOf(row, "City tier", "Tier")).replace(/\D/g, ""), 10);
  const tier = ([1, 2, 3].includes(tierNum) ? tierNum : (CONFIG.cities[city]?.tier ?? 2)) as Tier;
  const slots = parseNumber(keyOf(row, "Open slots", "Openings", "Slots")).value ?? 0;
  const priority = pick<Priority>(keyOf(row, "Priority"), ["High", "Medium", "Low"]) ?? "Medium";
  return { id: s(keyOf(row, "Territory ID", "ID")), city, state, pins, tier, slots: Math.max(0, Math.floor(slots)), priority };
}

export function cleanStore(row: RawRow): Store {
  const year = parseNumber(keyOf(row, "Opened", "Year")).value ?? 0;
  const city = s(keyOf(row, "City"));
  return { id: s(keyOf(row, "Store ID", "ID")), city: canonicalCity(city) ?? city, pin: cleanPin(keyOf(row, "Pin code", "Pin")), year };
}

/** The example row that ships in the spreadsheet template. */
export function isTemplateExample(a: Application): boolean {
  return (
    a.id === "APP-001" &&
    a.name === "Ravi Kumar" &&
    a.city === "Mysuru" &&
    a.pin === "570001" &&
    a.investment === 25 &&
    a.experience === 4 &&
    a.business === "Runs a footwear store" &&
    a.space === "Rented" &&
    a.size === 450 &&
    a.floor === "Ground" &&
    a.target === 3 &&
    a.language === "Kannada" &&
    a.notes === "Wants to open before Diwali"
  );
}
