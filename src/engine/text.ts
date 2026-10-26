import { humanise } from "./labels";
import type { Application } from "./types";

/** The sentence of the notes a suggestion comes from, shortened. */
const quoteOf = (notes: string, at: number): string => {
  const start = Math.max(notes.lastIndexOf(".", at) + 1, 0);
  const endAt = notes.indexOf(".", at);
  const q = notes.slice(start, endAt < 0 ? notes.length : endAt).replace(/\s+/g, " ").trim();
  return q.length > 110 ? `${q.slice(0, 107)}...` : q;
};
const months_ = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
const suggest = (fields: string, value: string, quote: string) => `Suggested update: ${fields} → ${value} (notes: "${quote}"). Confirm with the applicant first.`;

export const INSTRUCTION_PATTERN =
  /(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|polic(y|ies)|previous|above|system|prompt)|\b(approve|accept|select|shortlist|prioriti[sz]e)\s+(me|this|my)\b|\bsystem prompt\b|\byou (must|should|have to) (approve|accept)|\bscore me\b|\bgive me (a )?(10|100|top|full)|\bact as\b|\bpretend\b/i;

export function hasInstruction(text: string): boolean {
  return INSTRUCTION_PATTERN.test(text);
}

const HIGH =
  /(foot\s?wear|shoes?|sandals?|chappals?|sneakers?|cloth(es|ing)?|garments?|apparel|fashion|boutique|sarees?|textiles?|bags?|luggage|accessor(y|ies)|general (store|shop)|kirana|provision|grocery|daily needs|supermarket|ಅಂಗಡಿ|ಚಪ್ಪಲಿ|ಬಟ್ಟೆ|दुकान|कपड़|जूते|चप्पल|किराना)/i;
const OTHER_SHOP =
  /(shop|store|stall|showroom|outlet|dealer|trader|trading|vendor|retail|mart|bazaar|mobile|electronics|pharmacy|medical|hardware|stationery|gift|cosmetics|jewel|furniture|bakery|salon)/i;
const NONE = /^(none|nil|na|n\/a|no|not applicable|-|—)?$/i;

export function businessRelevance(a: Pick<Application, "business">): "high" | "medium" | "low" {
  const t = a.business.trim();
  if (NONE.test(t)) return "low";
  if (HIGH.test(t)) return "high";
  if (OTHER_SHOP.test(t)) return "medium";
  return "low";
}

export interface NoteFindings {
  contradictions: string[];
  suggestions: string[];
  instruction: boolean;
}

/** Looks for things the notes say that clash with the form, or new facts to confirm. Never applies them. */
export function readNotes(a: Application): NoteFindings {
  const text = `${a.business}. ${a.notes}`;
  const notes = a.notes;
  const contradictions: string[] = [];
  const suggestions: string[] = [];

  if ((a.experience ?? 0) === 0 && !a.experienceProblem) {
    const runsShops =
      /\b(runs?|running|owns?|operates?|managed?|managing)\b[^.]{0,25}\b(\d+|one|two|three|four|five|several|many)\b[^.]{0,15}\b(shops?|stores?|outlets?)\b/i.test(text);
    const yearsInRetail = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*(years?|yrs?)\b[^.]{0,30}\b(shop|store|retail|business|experience)/i.test(text);
    if (runsShops || yearsInRetail) contradictions.push("The notes describe running shops, but the form says 0 years of experience.");
  }
  if ((a.experience ?? 0) >= 3 && /\b(no|zero|without)\s+(retail\s+)?experience\b|\bfirst[- ]time\b|\bnever (run|ran|managed)\b/i.test(notes))
    contradictions.push(`The notes say no retail experience, but the form says ${a.experience} years.`);

  const inv = notes.match(/\b(invest(ment)?|capital|budget|can (put|invest)|have)\b[^.]{0,30}?(\d+(\.\d+)?)\s*(lakhs?|lacs?|l)\b/i);
  if (inv && a.investment !== null && Math.abs(parseFloat(inv[4]) - a.investment) > 0.01) {
    contradictions.push(`The notes mention ₹${inv[4]} lakh, but the form says ₹${a.investment} lakh.`);
    suggestions.push(suggest("investment", `₹${inv[4]} lakh`, quoteOf(notes, inv.index ?? 0)));
  }

  const months = notes.match(/\b(open|launch|start)\b[^.]{0,25}?\b(\d+)\s*months?\b|\bin\s+(\d+)\s*months?\b/i);
  const m = months ? parseFloat(months[2] ?? months[3]) : NaN;
  if (!Number.isNaN(m) && a.target !== null && m !== a.target) {
    contradictions.push(`The notes say ${months_(m)} to open, but the form says ${months_(a.target)}.`);
    suggestions.push(suggest("target launch", months_(m), quoteOf(notes, months?.index ?? 0)));
  }

  if (a.space === "Owned" && /\b(no shop|don'?t have (a )?(shop|space)|not found (a )?(shop|space)|looking for (a )?(shop|space))\b/i.test(notes))
    contradictions.push("The form says the space is owned, but the notes say no space has been found.");

  const noSpace = a.space === "Not yet identified" || a.space === null;
  const found = notes.match(/\b(found|got|have|has|secured|signed|finali[sz]ed|booked|leased|taken|identified)\b[^.]{0,30}\b(shop|space|store|unit|premises|showroom|building)\b/i);
  const negated = /\b(not|no|yet to|haven'?t|have not|looking|searching|trying)\b[^.]{0,20}\b(found|find|got|have)\b/i.test(notes);
  if (noSpace && found && !negated) {
    const fields = ["space"];
    const values = ["a shop has been found"];
    const floor = notes.match(/\b(ground|upper|first|second)\s*floor\b|\bmall\b/i);
    if (floor) {
      fields.push("floor");
      values.push(/mall/i.test(floor[0]) ? "mall unit" : /ground/i.test(floor[0]) ? "ground floor" : "upper floor");
    }
    const sq = notes.match(/(\d{2,5})\s*(sq\.?\s*ft|sqft|square feet)/i);
    if (sq) {
      fields.push("size");
      values.push(`${sq[1]} sq ft`);
    }
    suggestions.push(suggest(fields.join(", "), values.join(", "), quoteOf(notes, found.index ?? 0)));
  }
  return { contradictions, suggestions, instruction: hasInstruction(notes) || hasInstruction(a.business) };
}

export interface ReadText {
  business: "high" | "medium" | "low";
  contradictions: string[];
  suggestions: string[];
  instruction: boolean;
  fromAssistant: boolean;
}

/**
 * Combines the keyword reading with the language assistant's hints, when there are any.
 * The keyword checks always run, so the result is the same with the assistant off.
 */
export function readText(a: Application, hint?: import("./types").Hint): ReadText {
  const found = readNotes(a);
  const keyword = businessRelevance(a);
  const business = hint && hint.business !== "unknown" ? hint.business : keyword;
  const contradictions = Array.from(new Set([...found.contradictions, ...(hint?.contradictions ?? []).map(humanise).filter((c) => c.trim().split(/\s+/).length >= 5)]));
  // Vague claims from the assistant ("interested", "will send details") are not updates, so only concrete facts found in the notes are suggested.
  const suggestions = Array.from(new Set(found.suggestions));
  return { business, contradictions, suggestions, instruction: found.instruction || !!hint?.instruction, fromAssistant: !!hint && hint.source === "assistant" };
}
