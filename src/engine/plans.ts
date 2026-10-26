import { DEFAULT_ASSUMPTIONS, chainWeeks, earliestMonths, type Assumptions } from "./config";
import type { Application, Decision, Language } from "./types";

export type StageStatus = "Not started" | "In progress" | "Done" | "Stuck";
export const STAGE_STATUSES: StageStatus[] = ["Not started", "In progress", "Done", "Stuck"];

export interface StageDef {
  key: StageKey;
  name: string;
  owner: string;
  what: string;
}
export type StageKey = "findSpace" | "siteApproval" | "agreement" | "fitOut" | "hiring" | "training" | "inventory" | "softLaunch";

export const STAGE_DEFS: StageDef[] = [
  { key: "findSpace", name: "Find a space", owner: "Partner", what: "Find a shop space (ground floor, 400 to 800 sq ft does best) and send us its details." },
  { key: "siteApproval", name: "Site approval", owner: "Expansion team", what: "Site visit: footfall, shop front, visibility from the road, nearby shoe shops. If rented: the landlord's written consent." },
  { key: "agreement", name: "Franchise agreement", owner: "Legal and Finance", what: "Financial verification and checks before we sign are clear. Agreement signed and franchise fee paid." },
  { key: "fitOut", name: "Shop fit-out", owner: "Store design team", what: "Shop layout, racks and display, trial seating, signage." },
  { key: "hiring", name: "Hiring", owner: "Partner", what: "Hire the store manager and sales staff." },
  { key: "training", name: "Training", owner: "Training team", what: "The partner, store manager and sales staff complete training." },
  { key: "inventory", name: "Inventory", owner: "Supply and IT", what: "Billing and stock software set up. Opening stock ordered from the warehouse and delivered." },
  { key: "softLaunch", name: "Soft launch", owner: "Partner with Kicks", what: "Opening checklist signed off, first-week support visit booked." },
];

export interface Stage extends StageDef {
  n: number;
  weeks: number;
  start: Date;
  end: Date;
}

const DAY = 86_400_000;
const addDays = (d: Date, days: number) => new Date(d.getTime() + Math.round(days) * DAY);

/** Lays the stages out in time. Hiring runs beside fit-out and inventory beside training. */
function layout(asm: Assumptions, withFindSpace: boolean): { key: StageKey; from: number; to: number }[] {
  const w = asm.stageWeeks;
  const out: { key: StageKey; from: number; to: number }[] = [];
  let t = 0;
  if (withFindSpace) {
    out.push({ key: "findSpace", from: t, to: t + w.findSpace });
    t += w.findSpace;
  }
  out.push({ key: "siteApproval", from: t, to: t + w.siteApproval });
  t += w.siteApproval;
  out.push({ key: "agreement", from: t, to: t + w.agreement });
  t += w.agreement;
  out.push({ key: "fitOut", from: t, to: t + w.fitOut });
  out.push({ key: "hiring", from: Math.max(t, t + w.fitOut - w.hiring), to: t + w.fitOut });
  t += w.fitOut;
  out.push({ key: "training", from: t, to: t + w.training });
  out.push({ key: "inventory", from: t, to: t + w.inventory });
  t += Math.max(w.training, w.inventory);
  out.push({ key: "softLaunch", from: t, to: t + w.softLaunch });
  return out;
}

/** Stages with real dates. Forward from a start date, or backward from a launch date. */
export function schedule(anchor: Date, mode: "forward" | "backward", hasSpace: boolean, asm: Assumptions = DEFAULT_ASSUMPTIONS): { stages: Stage[]; start: Date; launch: Date } {
  const slots = layout(asm, !hasSpace);
  const total = chainWeeks(asm, !hasSpace);
  const start = mode === "forward" ? anchor : addDays(anchor, -total * 7);
  const stages = slots.map((s, i) => {
    const def = STAGE_DEFS.find((d) => d.key === s.key)!;
    return { ...def, n: i + 1, weeks: s.to - s.from, start: addDays(start, s.from * 7), end: addDays(start, s.to * 7) };
  });
  return { stages, start, launch: addDays(start, total * 7) };
}

export function stagesFor(d: Pick<Decision, "hasSpace" | "condition">): StageDef[] {
  const needsSpace = !d.hasSpace || d.condition.some((c) => c.kind === "space");
  return STAGE_DEFS.filter((s) => (s.key === "findSpace" ? needsSpace : true));
}

/** When a stage should start and end if work begins on the day of approval. */
export function stageWindow(approvedOn: Date, key: StageKey, needsSpace: boolean, asm: Assumptions = DEFAULT_ASSUMPTIONS): { start: Date; end: Date } {
  const s = schedule(approvedOn, "forward", !needsSpace, asm).stages.find((x) => x.key === key);
  return s ? { start: s.start, end: s.end } : { start: approvedOn, end: approvedOn };
}

export interface Timeline {
  stages: Stage[];
  start: Date;
  launch: Date;
  target: Date | null;
  tooEarly: boolean;
  realisticLaunch: Date;
  weeksTooEarly: number;
  text: string;
}

const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Plans backwards from the target launch. If there isn't time, shows the realistic plan instead. */
export function buildTimeline(a: Application, d: Pick<Decision, "hasSpace" | "condition">, asOf: Date, asm: Assumptions = DEFAULT_ASSUMPTIONS): Timeline {
  const needsSpace = !d.hasSpace || d.condition.some((c) => c.kind === "space");
  const hasSpace = !needsSpace;
  const realistic = schedule(asOf, "forward", hasSpace, asm);
  const target = a.target !== null ? addDays(asOf, a.target * 30.4) : null;
  if (!target) return { stages: realistic.stages, start: asOf, launch: realistic.launch, target: null, tooEarly: false, realisticLaunch: realistic.launch, weeksTooEarly: 0, text: `No target launch was given. The earliest realistic opening is ${dateText(realistic.launch)}.` };
  const back = schedule(target, "backward", hasSpace, asm);
  if (back.start.getTime() >= asOf.getTime() - DAY) return { stages: back.stages, start: back.start, launch: target, target, tooEarly: false, realisticLaunch: realistic.launch, weeksTooEarly: 0, text: `Planned backwards from the target of ${dateText(target)}. Work starts by ${dateText(back.start)}.` };
  const weeks = Math.max(1, Math.round((realistic.launch.getTime() - target.getTime()) / (7 * DAY)));
  return {
    stages: realistic.stages, start: asOf, launch: realistic.launch, target, tooEarly: true, realisticLaunch: realistic.launch, weeksTooEarly: weeks,
    text: `The target of ${dateText(target)} is about ${weeks} week(s) too early${hasSpace ? "" : ", because a space still has to be found"}. The realistic opening is ${dateText(realistic.launch)}.`,
  };
}

export interface LaunchCheck {
  expected: Date;
  target: Date | null;
  weeksLate: number;
  text: string;
  ok: boolean;
}

export function launchCheck(a: Application, d: Pick<Decision, "hasSpace" | "condition">, now: Date, asm: Assumptions = DEFAULT_ASSUMPTIONS): LaunchCheck {
  const t = buildTimeline(a, d, now, asm);
  return { expected: t.realisticLaunch, target: t.target, weeksLate: t.weeksTooEarly, ok: !t.tooEarly, text: t.text };
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

const MODULE_NAMES: Record<Exclude<Language, "English">, string[]> = {
  Kannada: ["ಉತ್ಪನ್ನ ಶ್ರೇಣಿ ಮತ್ತು ಗಾತ್ರಗಳು", "ಗ್ರಾಹಕರಿಗೆ ಸರಿಯಾದ ಅಳತೆ ನೋಡುವುದು", "ಸ್ಟಾಕ್ ಜೋಡಣೆ ಮತ್ತು ಪ್ರದರ್ಶನ", "ಬಿಲ್ಲಿಂಗ್ ಮತ್ತು ಸ್ಟಾಕ್ ಸಾಫ್ಟ್‌ವೇರ್", "ಹಿಂತಿರುಗಿಸುವಿಕೆ ಮತ್ತು ಬದಲಾವಣೆ", "ಗ್ರಾಹಕ ಸೇವೆ", "ಬ್ರಾಂಡ್ ಮಾನದಂಡಗಳು", "ಪರವಾನಗಿ ಮತ್ತು ತೆರಿಗೆ ನೋಂದಣಿ", "ಸಿಬ್ಬಂದಿ ನೇಮಕ ಮತ್ತು ನಿರ್ವಹಣೆ"],
  Hindi: ["उत्पाद रेंज और साइज़", "ग्राहकों का सही नाप लेना", "स्टॉक सजाना और डिस्प्ले", "बिलिंग और स्टॉक सॉफ़्टवेयर", "रिटर्न और एक्सचेंज", "ग्राहक सेवा", "ब्रांड मानक", "लाइसेंस और टैक्स रजिस्ट्रेशन", "स्टाफ की भर्ती और प्रबंधन"],
};
const EXTRA_NAMES: Record<string, Record<Exclude<Language, "English">, string>> = {
  "Shop basics": { Kannada: "ಅಂಗಡಿ ನಡೆಸುವ ಮೂಲಭೂತ ಅಂಶಗಳು", Hindi: "दुकान चलाने की बुनियादी बातें" },
  "Daily cash handling": { Kannada: "ದಿನನಿತ್ಯದ ನಗದು ನಿರ್ವಹಣೆ", Hindi: "रोज़ का नकद प्रबंधन" },
  "Working in an existing Kicks store": { Kannada: "ಈಗಿರುವ ಕಿಕ್ಸ್ ಸ್ಟೋರ್‌ನಲ್ಲಿ ಕೆಲಸ", Hindi: "मौजूदा Kicks स्टोर में काम" },
  "Choosing the right shop": { Kannada: "ಸರಿಯಾದ ಅಂಗಡಿ ಆಯ್ಕೆ", Hindi: "सही दुकान चुनना" },
  "Attracting walk-in customers": { Kannada: "ದಾರಿಹೋಕ ಗ್ರಾಹಕರನ್ನು ಸೆಳೆಯುವುದು", Hindi: "राह चलते ग्राहकों को आकर्षित करना" },
};

export function moduleName(name: string, lang: Language): string {
  if (lang === "English") return name;
  const i = KICKS_MODULES.indexOf(name);
  if (i >= 0) return MODULE_NAMES[lang][i];
  return EXTRA_NAMES[name]?.[lang] ?? name;
}

export interface TrainingPlan {
  programme: string;
  duration: string;
  days: number;
  hours: number;
  language: Language;
  basics: string[];
  focus: { module: string; why: string }[];
  modules: string[];
  sessions: { day: string; topic: string; local: string }[];
}

export function trainingPlan(a: Application, d: Decision, asm: Assumptions = DEFAULT_ASSUMPTIONS): TrainingPlan {
  const exp = a.experience ?? 0;
  let programme: string;
  let days: number;
  let basics: string[] = [];
  if (exp < 1) {
    programme = "Full programme for first-time shop owners";
    days = asm.trainingDays.none;
    basics = ["Shop basics", "Daily cash handling"];
  } else if (exp < 3) {
    programme = "Standard programme";
    days = asm.trainingDays.low;
  } else {
    programme = "Kicks modules only";
    days = asm.trainingDays.high;
  }
  const focus: { module: string; why: string }[] = [];
  if (exp < 1) focus.push({ module: "Daily cash handling", why: "No shop experience yet." }, { module: "Hiring and managing staff", why: "First time managing a team." });
  if (!d.hasSpace) focus.push({ module: "Choosing the right shop", why: "No space found yet. Ground floor, 400 to 800 sq ft does best." });
  if (a.floor === "Upper") focus.push({ module: "Attracting walk-in customers", why: "Upper-floor shops get less street traffic." });
  if (d.business !== "high") focus.push({ module: "Product ranges and sizing", why: "No footwear or similar retail background. Extra practice on sizes and ranges." }, { module: "Fitting customers", why: "Extra practice on fitting." });
  if (exp < 3) focus.push({ module: "Billing and stock software", why: "Needed from the first day." });
  const seen = new Set<string>();
  const unique = focus.filter((f) => (seen.has(f.module) ? false : (seen.add(f.module), true)));

  // Spread the topics across the training days, most needed first.
  const placement: string[] = [];
  if (exp < 1) for (let i = 0; i < Math.min(3, days); i++) placement.push("Working in an existing Kicks store");
  const topics = [...basics, ...unique.map((f) => f.module), ...KICKS_MODULES].filter((t, i, arr) => arr.indexOf(t) === i);
  const room = Math.max(1, days - placement.length);
  const perDay = Math.max(1, Math.ceil(topics.length / room));
  const sessions: TrainingPlan["sessions"] = placement.map((t, i) => ({ day: `Day ${i + 1}`, topic: t, local: moduleName(t, a.language) }));
  for (let day = 0; day < room && day * perDay < topics.length; day++) {
    const chunk = topics.slice(day * perDay, day * perDay + perDay);
    sessions.push({ day: `Day ${placement.length + day + 1}`, topic: chunk.join(", "), local: chunk.map((t) => moduleName(t, a.language)).join(", ") });
  }
  return {
    programme,
    duration: `${days} days${exp < 1 ? ", including 3 days working in an existing Kicks store" : ""}`,
    days,
    hours: days * asm.trainingHoursPerDay,
    language: a.language,
    basics,
    focus: unique,
    modules: KICKS_MODULES,
    sessions,
  };
}

export interface ChecklistItem {
  key: string;
  group: string;
  text: string;
}

/** What the partner needs to bring or do, based on their own situation. */
export function partnerChecklist(a: Application, d: Pick<Decision, "hasSpace" | "condition" | "redirectPin" | "setupCost">): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { key: "id", group: "Documents", text: "ID and address proof" },
    { key: "pan", group: "Documents", text: "PAN card" },
    { key: "bank", group: "Finance", text: "Bank statements for the last 6 months" },
    { key: "itr", group: "Finance", text: "Income tax returns for the last 2 years" },
    { key: "funds", group: "Finance", text: `Proof of the investment${d.setupCost ? ` (setup cost ₹${d.setupCost} lakh)` : ""} and where the money comes from` },
    { key: "police", group: "Checks before we sign", text: "Police verification certificate" },
    { key: "credit", group: "Checks before we sign", text: "Consent for a credit check" },
  ];
  if (d.condition.some((c) => c.kind === "funding")) items.push({ key: "extra", group: "Finance", text: "Proof of the extra funds (loan sanction letter or own funds)" });
  const needsSpace = !d.hasSpace || d.condition.some((c) => c.kind === "space");
  if (needsSpace) items.push({ key: "space", group: "Shop space", text: `Shortlist 2 or 3 spaces${d.redirectPin ? ` in pin code ${d.redirectPin}` : ""} (ground floor, 400 to 800 sq ft) and send their details` });
  else if (a.space === "Owned") items.push({ key: "own", group: "Shop space", text: "Ownership papers and revenue (tehsildar) records for the shop" });
  else items.push({ key: "rent", group: "Shop space", text: "Rental agreement with lock-in period, and the landlord's written consent" });
  items.push(
    { key: "reg", group: "Registrations", text: "Shop registration, trade licence and GST applied for (Legal confirms the current list for your city)" },
    { key: "staff", group: "Before opening", text: "Store manager and sales staff hired and ready for training" },
  );
  return items;
}

export { earliestMonths };
