import { compareApplicants, explainDecision, executeTool, findApp, getApplication, rerunEngine, type ToolContext, type UpdateArgs } from "@/ai/tools";
import { run, STATUS_LABEL } from "./run";
import { toRunInput } from "@/lib/workspace";
import { oneLineReply, type DiffCard } from "@/lib/diffcard";
import type { Application, Status } from "./types";

/** What the chat still needs before it can save a change. */
export interface Pending {
  id: string;
  changes: Omit<UpdateArgs, "id">;
}

export interface ChatReply {
  text: string;
  cards: DiffCard[];
  pending?: Pending | null;
}

export function findIds(text: string, apps: Application[]): string[] {
  const out: string[] = [];
  const re = /\bapp[-\s]?0*(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const hit = apps.find((a) => parseInt(a.id.replace(/\D/g, ""), 10) === parseInt(m![1], 10));
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

const num = (s: string) => parseFloat(s);

/** Reads the facts a sentence states. Ownership is only set when it is said. */
export function parseFields(text: string): Omit<UpdateArgs, "id"> {
  const t = text.toLowerCase();
  const f: Omit<UpdateArgs, "id"> = {};
  if (/ground[\s-]*floor|\bground\b/.test(t)) f.floor = "Ground";
  else if (/\bmall\b/.test(t)) f.floor = "Mall unit";
  else if (/upper|first[\s-]*floor|second[\s-]*floor|1st floor|2nd floor/.test(t)) f.floor = "Upper";
  const sz = t.match(/(\d{2,5})\s*(sq\.?\s*ft|sqft|square\s*feet|sq\.?\s*feet)/);
  if (sz) f.size = num(sz[1]);
  if (/\bown(ed|s)?\b|ownership|\bpurchased\b|\bbought\b/.test(t) && !/\bnot own/.test(t)) f.space = "Owned";
  else if (/\brent(ed|ing|s)?\b|\blease(d)?\b/.test(t)) f.space = "Rented";
  else if (/\bnot yet (found|identified)\b|lost (the|his|her|their) (shop|space)/.test(t)) f.space = "Not yet identified";
  const inv = t.match(/(\d+(\.\d+)?)\s*(lakhs?|lacs?)\b/);
  if (inv && /invest|capital|budget|fund|raise|increase|afford|put in|can/.test(t)) f.investment = num(inv[1]);
  const exp = t.match(/(\d+(\.\d+)?)\s*(years?|yrs?)\b/);
  if (exp && /experience|ran|run|worked|managed|retail/.test(t)) f.experience = num(exp[1]);
  const mo = t.match(/(\d+(\.\d+)?)\s*months?\b/);
  if (mo && /launch|open|target|start|wants/.test(t)) f.target = num(mo[1]);
  const pin = text.match(/(?<![\d-])(\d{6})(?!\d)/);
  if (pin) f.pin = pin[1];
  return f;
}

const hasFields = (f: Omit<UpdateArgs, "id">) => Object.values(f).some((v) => v !== undefined);

function lines(...l: (string | null | false | undefined)[]): string {
  return l.filter((x) => x !== null && x !== false && x !== undefined).join("\n");
}

function label(s: Status) {
  return STATUS_LABEL[s];
}

function saveReply(ctx: ToolContext, out: unknown, pendingFrom?: { id: string; changes: Omit<UpdateArgs, "id"> }): ChatReply {
  const o = out as { saved?: boolean; needs_clarification?: string; error?: string; message?: string; already?: boolean };
  if (o.needs_clarification) return { text: o.needs_clarification, cards: [], pending: pendingFrom ?? null };
  if (o.error || o.already) return { text: o.message ?? "That did not work. Nothing was saved.", cards: [] };
  const card = ctx.cards[ctx.cards.length - 1] ?? null;
  return { text: card ? oneLineReply(card) : "**Saved.** The change is saved and everyone was re-checked.", cards: card ? [card] : [] };
}

function whyText(ctx: ToolContext, id: string): string {
  const e = explainDecision(ctx, { id }) as Record<string, unknown> & { error?: string; message?: string };
  if (e.error) return e.message as string;
  const trail = (e.reasonTrail as { check: string; result: string; detail: string }[]).map((t) => `- ${t.result === "pass" ? "✓" : t.result === "fail" ? "✗" : "•"} ${t.check}: ${t.detail}`);
  const parts = (e.scoreBreakdown as { part: string; points: number; max: number }[] | null)?.map((p) => `${p.part} ${p.points}/${p.max}`).join(", ");
  const what = (e.whatWouldChange as string[]) ?? [];
  return lines(`**${e.id} · ${e.status}**`, `${e.verdict}`, "", "Because (from the stored reason trail):", ...trail, parts && `Score parts: ${parts}.`, what.length > 0 && "", what.length > 0 && "What would change it:", ...what.map((w) => `- ${w}`));
}

function compareText(ctx: ToolContext, ids: string[], message: string): string {
  const c = compareApplicants(ctx, { ids }) as { items: Record<string, unknown>[] };
  const items = c.items as unknown as { id: string; status: string; verdict: string; score: number | null; scoreBreakdown: { part: string; points: number; max: number }[] | null; requestedPin: string; requestedPinHeldBy: unknown; assignedPin: string | null; allocationLines: string[] }[];
  const out: string[] = [];
  const notApproved = items.filter((i) => !/^Approved/.test(i.status) && !/Redirected/.test(i.status));
  if (/approved/i.test(message) && notApproved.length > 0) {
    out.push(`**One correction first:** ${notApproved.map((i) => `${i.id} is not approved (${i.status.toLowerCase()}, score ${i.score ?? "none"})`).join("; ")}.`, "");
  }
  for (const i of items) {
    const holder = i.requestedPinHeldBy;
    const holderText = holder === i.id ? "holds it" : holder && typeof holder === "object" ? `held by ${(holder as { id: string }).id} (score ${(holder as { score: number | null }).score})` : "not held by anyone";
    out.push(`**${i.id} · ${i.status}** — score ${i.score ?? "none"}; asked for pin ${i.requestedPin}, ${holderText}${i.assignedPin && i.assignedPin !== i.requestedPin ? `; assigned ${i.assignedPin}` : ""}.`);
    if (i.scoreBreakdown) out.push(`- Parts: ${i.scoreBreakdown.map((p) => `${p.part} ${p.points}/${p.max}`).join(", ")}.`);
    for (const l of i.allocationLines.slice(0, 3)) out.push(`- ${l}`);
    out.push("");
  }
  const scored = items.filter((i) => i.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (scored.length >= 2 && items.some((i) => /Waiting/.test(i.status))) out.push("A higher score does not guarantee an opening: one store per pin code and the number of openings in the area decide who gets a pin. The score decides who goes first for it.");
  return out.join("\n").trim();
}

/** Answers without the language assistant. Same tools, same saves, plain parsing. */
export async function fallbackChat(message: string, ctx: ToolContext, pending?: Pending | null): Promise<ChatReply> {
  const q = message.trim();
  const t = q.toLowerCase();
  const apps = ctx.ws.applications;
  if (apps.length === 0) return { text: "There are no applications in this run yet. Import a spreadsheet first, then ask me about any applicant." , cards: [] };
  const ids = findIds(q, apps);
  const unknown = /\bapp[-\s]?\d+/i.test(q) && ids.length === 0;
  if (unknown) return { text: "I couldn't find that application number in this run.", cards: [], pending };

  if (/(approve|accept|select|pass|promote)[^.]*(anyway|regardless|no matter)|skip (the )?rules|ignore (the )?rules|bypass|force[- ]approve/.test(t)) {
    return {
      text: lines("I can't skip the rules. Every opening has to respect one store per pin code and the number of openings in each area.", `If the team has a good reason to decide differently${ids[0] ? ` for ${ids[0]}` : ""}, open the applicant and use **Change this decision**. It asks for a reason and keeps a record.`),
      cards: [],
    };
  }

  // Answer to a question we asked: it belongs to the same change.
  if (pending && ids.length === 0) {
    const f = parseFields(q);
    const bare = q.match(/^\D*(\d{2,5})\D*$/);
    if (!f.size && bare) f.size = num(bare[1]);
    if (hasFields(f)) {
      const merged = { ...pending.changes, ...f };
      const out = await executeTool(ctx, "update_application", { id: pending.id, ...merged });
      return saveReply(ctx, out, { id: pending.id, changes: merged });
    }
  }

  const territoryRef = q.match(/\bter-?\s?0*(\d+)\b/i);
  if (territoryRef && /(add|another|extra|more|increase|remove|reduce|fewer|less)\b[^.]*\b(opening|slot)s?|\b(opening|slot)s?\b[^.]*\b(add|more|extra|increase|remove|reduce)/i.test(q)) {
    const word = /\b(two|2)\b/.test(t) ? 2 : /\b(three|3)\b/.test(t) ? 3 : 1;
    const delta = /(remove|reduce|fewer|less|take away)/.test(t) ? -word : word;
    const area = ctx.ws.territories.find((a) => a.id.replace(/\D/g, "").replace(/^0+/, "") === territoryRef[1].replace(/^0+/, ""));
    if (!area) return { text: `I couldn't find area TER-${territoryRef[1]} in this run.`, cards: [] };
    return saveReply(ctx, await executeTool(ctx, "update_territory", { id: area.id, slots_delta: delta }));
  }

  if (ids.length && /\b(withdrawn|withdraw|withdraws|withdrew|withdrawing|pulled out|dropped out|no longer interested|backed out)\b/.test(t)) {
    return saveReply(ctx, await executeTool(ctx, "withdraw_application", { id: ids[0] }));
  }

  const asksQuestion = /^\s*(why|who|how|what|which|when|where|is|are|does|do|did|show|list|tell|explain|compare)\b|\?\s*$/.test(t) && !/\b(what if|suppose)\b/.test(t);
  if (ids.length === 1 && !asksQuestion) {
    const f = parseFields(q);
    const news = /\b(found|got|has|have|now|leased|lease|signed|booked|secured|managed|raised|increased|moved|changed|updated|can)\b/.test(t);
    const foundShop = /(found|got|secured|signed|leased|booked|arranged)[^.]*\b(shop|space|store|unit|premises)\b/.test(t);
    if (foundShop && !hasFields(f)) return { text: "Is the shop owned or rented?", cards: [], pending: { id: ids[0], changes: {} } };
    if (news || hasFields(f)) {
      const out = await executeTool(ctx, "update_application", { id: ids[0], ...f });
      return saveReply(ctx, out, { id: ids[0], changes: f });
    }
  }

  if (ids.length >= 2 && /(compare|versus|\bvs\b|while|whereas|than|side by side|but)/.test(t)) return { text: compareText(ctx, ids, q), cards: [] };
  if (ids.length >= 2 && /why/.test(t)) return { text: compareText(ctx, ids, q), cards: [] };

  const result = run(toRunInput(ctx.ws));
  if (ids.length) {
    const id = ids[0];
    const d = result.decisions[id];
    if (/\bahead\b|before (him|her|them)|ranked above/.test(t)) {
      if (d.status !== "waiting") return { text: `**${id} · ${label(d.status)}**\n${id} is not on the waiting list, so nobody is ahead. ${d.verdict}`, cards: [] };
      return { text: lines(`**${id} · ${label(d.status)}**`, `${d.ahead.length} applicant(s) are ahead of ${id} in ${d.territoryId}:`, ...d.ahead.map((x) => `- ${x}: ${label(result.decisions[x]?.status ?? "waiting")}, score ${result.decisions[x]?.score ?? "none"}`)), cards: [] };
    }
    if (/train|learn|course|programme|program\b/.test(t)) {
      const info = getApplication(ctx, { id }) as { application?: { preferredLanguage: string; experienceYears: number | null } };
      return { text: lines(`**${id} · ${label(d.status)}**`, `Training is planned from the retail experience on the application (${info.application?.experienceYears ?? "not provided"} years), in ${info.application?.preferredLanguage ?? "the preferred language"}. Open the applicant's page for the full plan.`), cards: [] };
    }
    if (/next|need to do|what (should|do|does|must)|steps?|to do/.test(t) && !/why/.test(t)) return { text: lines(`**${id} · ${label(d.status)}**`, d.nextStep), cards: [] };
    return { text: whyText(ctx, id), cards: [] };
  }

  if (/(shortlist|top (five|5)|start with|start here|which five|first five)/.test(t)) {
    if (!result.shortlist.length) return { text: "Nobody is approved yet, so there is nothing to start with.", cards: [] };
    return { text: lines("**Start with these**", ...result.shortlist.map((s, i) => `${i + 1}. ${s.id} — value ${s.value} (score plus a bonus when the area is a priority).`)), cards: [] };
  }
  if (/\b(full|filled|no openings)\b|which areas|areas/.test(t)) {
    const full = result.territories.filter((a) => a.territory.slots > 0 && a.openingsLeft === 0);
    const open = result.territories.filter((a) => a.openingsLeft > 0);
    return { text: lines("**Areas**", full.length ? `Full: ${full.map((a) => `${a.territory.id} (${a.territory.slots}/${a.territory.slots})`).join(", ")}.` : "No area is full.", open.length ? `Still open: ${open.map((a) => `${a.territory.id} (${a.openingsLeft} of ${a.territory.slots} left)`).join(", ")}.` : ""), cards: [] };
  }
  const listFor = (s: Status, title: string): ChatReply => {
    const ds = Object.values(result.decisions).filter((d) => d.status === s);
    if (!ds.length) return { text: `**${title}**\nNobody right now.`, cards: [] };
    return { text: lines(`**${title}: ${ds.length}**`, ...ds.slice(0, 20).map((d) => `- ${d.id}: ${s === "needs_info" ? d.ask : d.verdict}`)), cards: [] };
  };
  if (/needs? info|missing|on hold|\bhold\b|incomplete|blocked/.test(t)) return listFor("needs_info", "Needs information");
  if (/waiting|waitlist/.test(t)) return listFor("waiting", "Waiting list");
  if (/redirect/.test(t)) return listFor("redirected", "Redirected");
  if (/not in (the )?(current )?plan/.test(t)) return listFor("not_in_plan", "Not in current plan");
  if (/not eligible|rejected|declined/.test(t)) return listFor("not_eligible", "Not eligible right now");
  if (/withdrawn/.test(t)) return listFor("withdrawn", "Withdrawn");
  if (/condition/.test(t)) return listFor("conditional", "Approved with a condition");
  if (/approved|who (got|has) (an )?opening/.test(t)) return listFor("approved", "Approved to proceed");
  if (/summary|overview|how many|count|status|everyone|all applicants|rerun|re-run/.test(t)) {
    const r = rerunEngine(ctx);
    return { text: lines(`**${r.applications} applications**`, ...Object.entries(r.counts).map(([k, v]) => `- ${k}: ${v}`)), cards: [] };
  }
  void findApp;
  return {
    text: lines(
      "I can answer questions about the decisions and save new information. Try:",
      '- "Why is APP-007 on the waiting list?"',
      '- "Compare APP-003 and APP-005"',
      '- "APP-002 has withdrawn"',
      '- "APP-012 found a 450 sq ft ground-floor rented shop"',
      '- "Add one opening to TER-03"',
      '- "Which areas are full?"',
    ),
    cards: [],
  };
}
