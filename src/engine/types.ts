import type { Assumptions } from "./config";

export type Status =
  | "approved"
  | "conditional"
  | "redirected"
  | "waiting"
  | "needs_info"
  | "not_in_plan"
  | "not_eligible"
  | "withdrawn";
export type Space = "Owned" | "Rented" | "Not yet identified";
export type Floor = "Ground" | "Upper" | "Mall unit" | "Not known";
export type Language = "Kannada" | "English" | "Hindi";
export type Priority = "High" | "Medium" | "Low";
export type Tier = 1 | 2 | 3;

export interface Application {
  id: string;
  name: string;
  city: string;
  state: string;
  pin: string;
  investment: number | null;
  experience: number | null;
  /** Set when the value could not be read: blank, negative or not a number. */
  investmentProblem?: string;
  experienceProblem?: string;
  business: string;
  space: Space | null;
  size: number | null;
  floor: Floor | null;
  target: number | null;
  language: Language;
  notes: string;
  /** Things the file reader changed while cleaning this row, shown in the data health report. */
  cleaned?: string[];
  /** The row's position in the uploaded file (1-based, counting from the first data row). */
  row?: number;
  withdrawn?: boolean;
  withdrawnReason?: string;
  /** Set only on a what-if copy: a space was found but its size is not known yet. */
  provisionalSize?: boolean;
}

export interface Territory {
  id: string;
  city: string;
  state: string;
  pins: string[];
  tier: Tier;
  slots: number;
  priority: Priority;
}

export interface Store {
  id: string;
  city: string;
  pin: string;
  year: number;
}

/** What the language assistant read from an applicant's free text. Hints never decide; the engine reads them. */
export interface Hint {
  business: "high" | "medium" | "low" | "unknown";
  claims: string[];
  contradictions: string[];
  instruction: boolean;
  source: "assistant" | "keywords";
}

export interface Offer {
  territoryId: string;
  city: string;
  pins: string[];
  openingsLeft: number;
  priority: Priority;
  sameCity: boolean;
}

export interface ScoreParts {
  investment: number;
  space: number;
  experience: number;
  timeline: number;
  priority: number;
  completeness: number;
}

export interface TrailItem {
  check: string;
  result: "pass" | "fail" | "warn" | "info";
  detail: string;
}

export interface Competitor {
  id: string;
  score: number | null;
  status: Status;
  pin: string | null;
}

export interface Decision {
  id: string;
  status: Status;
  verdict: string;
  /** Every check the engine made, in order. Every explanation is built from this. */
  reasonTrail: TrailItem[];
  /** What the applicant should do next, in plain words. */
  nextStep: string;
  /** Every sentence in the trail, in order. */
  reasons: string[];
  /** Warnings taken from the trail. */
  checks: string[];
  /** Single question to ask the applicant (needs information). */
  ask?: string;
  /** New facts the notes mention that the team should confirm. */
  suggestions: string[];
  score: number | null;
  parts: ScoreParts | null;
  territoryId: string | null;
  rank: number | null;
  position: number | null;
  ahead: string[];
  offers: Offer[];
  condition: { kind: "space" | "floor" | "funding"; text: string }[];
  earnBack: { months: number; low: number; high: number; slow: boolean; assumedRented: boolean } | null;
  nearbyStore: string | null;
  duplicateOf: string | null;
  tier: Tier | null;
  setupCost: number | null;
  hasSpace: boolean;
  earliestMonths: number;
  /** The pin this applicant would open at: their own, or the one offered to them. */
  assignedPin: string | null;
  /** Set when status is redirected. */
  redirectPin: string | null;
  /** Written when a tie decided the order. */
  tieBreak: string | null;
  /** Other applicants who asked for the same pin. */
  competitors: Competitor[];
  /** For a low score: the changes that would add the most points. */
  improvements: { change: string; gain: number }[];
  /** Points the business-background hint added inside retail experience. */
  businessBonus: number;
  /** Set when the team changed this decision. */
  changedByTeam: { status: Status; reason: string } | null;
  /** The engine's own status before a team change. */
  engineStatus: Status;
  business: "high" | "medium" | "low";
}

export interface Override {
  status: Status;
  reason: string;
}

export interface RunInput {
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  overrides?: Record<string, Override>;
  assumptions?: Partial<Assumptions>;
  hints?: Record<string, Hint>;
}

export type PinState = "store" | "allocated" | "redirected" | "contested" | "free";

export interface TerritoryResult {
  territory: Territory;
  approved: string[];
  redirected: string[];
  waiting: string[];
  applicants: string[];
  openingsLeft: number;
  freePins: string[];
  pins: { pin: string; state: PinState; by: string[] }[];
}

export interface RunResult {
  decisions: Record<string, Decision>;
  order: string[];
  territories: TerritoryResult[];
  shortlist: { id: string; value: number }[];
  problems: string[];
  assumptions: Assumptions;
}
