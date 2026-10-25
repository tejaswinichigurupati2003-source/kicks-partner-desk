export type Status = "approved" | "conditional" | "needs_info" | "waiting" | "not_eligible";
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
  experience: number;
  space: number;
  launch: number;
  business: number;
  complete: number;
}

export interface Decision {
  id: string;
  status: Status;
  verdict: string;
  reasons: string[];
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
  earnBack: { months: number; slow: boolean; assumedRented: boolean } | null;
  nearbyStore: string | null;
  duplicateOf: string | null;
  tier: Tier | null;
  setupCost: number | null;
  hasSpace: boolean;
  earliestMonths: number;
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
}

export interface TerritoryResult {
  territory: Territory;
  approved: string[];
  waiting: string[];
  applicants: string[];
  openingsLeft: number;
  freePins: string[];
}

export interface RunResult {
  decisions: Record<string, Decision>;
  order: string[];
  territories: TerritoryResult[];
  shortlist: { id: string; value: number }[];
  problems: string[];
}
