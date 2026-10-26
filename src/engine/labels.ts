/** Plain names for the fields the engine and the assistant talk about. Raw field keys never reach the screen. */
export const FIELD_LABELS: Record<string, string> = {
  targetMonths: "target launch",
  experienceYears: "retail experience",
  investmentLakh: "investment",
  sizeSqFt: "space size",
  requestedPin: "requested pin code",
  preferredLanguage: "preferred language",
  targetLaunchMonths: "target launch",
  minScoreToAllocate: "minimum score",
};

const RAW_KEYS = Object.keys(FIELD_LABELS);

/** Replaces raw field keys in a sentence with their plain names, and quoted bare keys such as "space" with the word. */
export function humanise(text: string): string {
  let out = text;
  for (const k of RAW_KEYS) out = out.replace(new RegExp(`\\b${k}\\b`, "g"), FIELD_LABELS[k]);
  out = out.replace(/["'`](space|floor|pin|name|city|notes|business|language)["'`]\s*[:=]/gi, (_m, w: string) => `${w}:`);
  return out;
}

/** True when a string still contains a raw field key. Used by tests. */
export function hasRawKey(text: string): boolean {
  return RAW_KEYS.some((k) => new RegExp(`\\b${k}\\b`).test(text)) || /\b(space|floor|pin)\s*[:=]\s*(null|undefined|"|\{)/.test(text);
}

const ASSUMPTION_LABELS: Record<string, string> = {
  minScoreToAllocate: "Minimum score to get an opening",
  investmentTolerancePct: "Investment tolerance (%)",
  minInvestmentPctOfSetup: "Minimum investment (% of setup cost)",
  conditionDays: "Days to meet a condition",
  shortlistSize: "Shortlist size",
};

/** A readable name for an assumption path such as "weights.investment" or "minScoreToAllocate". */
export function assumptionLabel(key: string): string {
  if (ASSUMPTION_LABELS[key]) return ASSUMPTION_LABELS[key];
  const words = key.split(".").map((k) => k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
