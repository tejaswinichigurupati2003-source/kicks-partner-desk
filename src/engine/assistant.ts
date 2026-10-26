import { run, STATUS_LABEL } from "./run";
import { applyChange, diff, whatWouldChange, withChange, type Change, type DiffRow } from "./rerun";
import { stagesFor, trainingPlan } from "./plans";
import type { Application, Decision, RunInput, RunResult, Status } from "./types";

export interface AssistantContext {
  input: RunInput;
  result: RunResult;
  now: Date;
}

export interface PendingChange {
  id: string;
  change: Change;
  assumed: string[];
}

export interface WhatIf {
  id: string;
  change: Change;
  provisional: boolean;
  missing: string[];
  assumed: string[];
  rows: DiffRow[];
}

export interface Reply {
  lines: string[];
  whatIf?: WhatIf;
  pending?: PendingChange | null;
  /** The standard wording could not answer; the assistant service may try. */
  needsAi?: { task: "ask" | "parseChange"; id?: string };
}

const num = (s: string) => parseFloat(s);

export function findIds(text: string, apps: Application[]): string[] {
  const out: string[] = [];
  const re = /\bapp[-\s]?0*(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    const hit = apps.find((a) => parseInt(a.id.replace(/\D/g, ""), 10) === n && /app/i.test(a.id)) ?? apps.find((a) => a.id.toLowerCase() === `app-${m![1]}`.toLowerCase());
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

export function parseChange(text: string, app: Application | undefined): { change: Change; assumed: string[]; missing: string[] } {
  const t = text.toLowerCase();
  const change: Change = {};
  const assumed: string[] = [];
  const missing: string[] = [];

  const ground = /ground[\s-]*floor|\bground\b/.test(t);
  const upper = /upper|first[\s-]*floor|second[\s-]*floor|1st floor|2nd floor/.test(t);
  const mall = /\bmall\b/.test(t);
  if (ground) change.floor = "Ground";
  else if (mall) change.floor = "Mall unit";
  else if (upper) change.floor = "Upper";

  const sz = t.match(/(\d{2,5})\s*(sq\.?\s*ft|sqft|square\s*feet|sq\.?\s*feet)/);
  if (sz) change.size = num(sz[1]);

  const owned = /\bown(ed|s)?\b|ownership/.test(t) && !/\bnot own/.test(t);
  const rented = /\brent(ed|ing|s)?\b|\blease(d)?\b/.test(t);
  if (owned) change.space = "Owned";
  else if (rented) change.space = "Rented";
  if (/\b(no|lost (the|his|her|their)|lost)\b[^.]{0,15}\b(shop|space)\b|\bnot yet (found|identified)\b/.test(t) && !change.space) change.space = "Not yet identified";

  const foundSpace = /(found|got|has|have|secured|signed|finali[sz]ed|booked|identified|arranged)[^.]{0,30}(shop|space|store|unit|premises|showroom|building)|(shop|space)[^.]{0,20}(found|ready|available)/.test(t);
  if (!change.space && (foundSpace || change.floor || change.size)) {
    if (app && (app.space === "Owned" || app.space === "Rented")) change.space = app.space;
    else {
      change.space = "Rented";
      assumed.push("rented (you did not say if it is owned or rented)");
    }
  }

  const inv = t.match(/(\d+(\.\d+)?)\s*(lakhs?|lacs?)\b/);
  if (inv && /invest|capital|budget|fund|raise|increase|afford|put in|can/.test(t)) change.investment = num(inv[1]);
  const exp = t.match(/(\d+(\.\d+)?)\s*(years?|yrs?)\b/);
  if (exp && /experience|ran|run|worked|managed|retail/.test(t)) change.experience = num(exp[1]);
  const mo = t.match(/(\d+(\.\d+)?)\s*months?\b/);
  if (mo && /launch|open|target|start|wants/.test(t)) change.target = num(mo[1]);
  const pin = text.match(/\b(\d{6})\b/);
  if (pin) change.pin = pin[1];
  if (/\bkannada\b/.test(t) && /language|train|speak|prefer/.test(t)) change.language = "Kannada";
  else if (/\bhindi\b/.test(t) && /language|train|speak|prefer/.test(t)) change.language = "Hindi";
  else if (/\benglish\b/.test(t) && /language|train|speak|prefer/.test(t)) change.language = "English";

  const spaceNow = change.space ?? app?.space;
  const sizeNow = change.size ?? app?.size ?? null;
  if ((spaceNow === "Owned" || spaceNow === "Rented") && sizeNow === null) missing.push("the size of the space in sq ft");
  return { change, assumed, missing };
}

const hasFields = (c: Change) => Object.keys(c).length > 0;

function fmtStatus(d: Decision | null): string {
  if (!d) return "New";
  return d.status === "waiting" && d.position ? `Waiting list, position ${d.position}` : STATUS_LABEL[d.status];
}

function head(d: Decision, name: string): string {
  return `**${d.id} · ${STATUS_LABEL[d.status]}** (${name || "name not provided"})`;
}

function listIds(ids: string[], ctx: AssistantContext, max = 12): string {
  const names = new Map(ctx.input.applications.map((a) => [a.id, a.name]));
  const shown = ids.slice(0, max).map((id) => `${id} (${names.get(id) || "name not provided"})`);
  return shown.join(", ") + (ids.length > max ? ` and ${ids.length - max} more` : "");
}

function why(id: string, ctx: AssistantContext): Reply {
  const d = ctx.result.decisions[id];
  const a = ctx.input.applications.find((x) => x.id === id)!;
  const lines = [head(d, a.name), d.verdict, ""];
  lines.push("Because:");
  for (const r of d.reasons.slice(0, 4)) lines.push(`- ${r}`);
  if (d.status === "waiting" && d.ahead.length) lines.push(`- Ahead of this applicant: ${d.ahead.join(", ")}.`);
  if (d.checks.length) {
    lines.push("", "Things to check:");
    for (const c of d.checks.slice(0, 4)) lines.push(`- ${c}`);
  }
  lines.push("", `What would change it: ${whatWouldChange(ctx.input, id)}`);
  return { lines };
}

function ahead(id: string, ctx: AssistantContext): Reply {
  const d = ctx.result.decisions[id];
  const a = ctx.input.applications.find((x) => x.id === id)!;
  if (d.status !== "waiting") return { lines: [head(d, a.name), `${id} is not on the waiting list, so nobody is ahead. ${d.verdict}`] };
  const rows = d.ahead.map((x) => {
    const dd = ctx.result.decisions[x];
    return `- ${x}: ${fmtStatus(dd)}${dd?.score !== null && dd ? `, score ${dd.score}` : ""}`;
  });
  return { lines: [head(d, a.name), `${d.ahead.length} applicant(s) are ahead of ${id} in ${d.territoryId}:`, ...rows, "", `${d.reasons[0]}`] };
}

function next(id: string, ctx: AssistantContext): Reply {
  const d = ctx.result.decisions[id];
  const a = ctx.input.applications.find((x) => x.id === id)!;
  const lines = [head(d, a.name)];
  if (d.status === "approved" || d.status === "conditional") {
    if (d.condition.length) {
      lines.push("First, the condition:");
      for (const c of d.condition) lines.push(`- ${c.text}`);
      lines.push("", "Then, getting ready to open (about 10 weeks):");
    } else lines.push("Next steps, about 10 weeks to open:");
    for (const s of stagesFor(d).filter((x) => x.n >= 1 && x.n <= 4)) lines.push(`- Weeks ${s.from}–${s.to} · ${s.name} (${s.owner})`);
    lines.push("", "Open the applicant's page to see all stages and update them.");
  } else if (d.status === "needs_info") lines.push(`Ask the applicant: ${d.ask}`, "They should reply within 7 days.");
  else if (d.status === "waiting") {
    lines.push(`Nothing to do yet. They are ${d.position ? `number ${d.position}` : "on"} the waiting list.`);
    if (d.offers.length) lines.push(`Offer them: ${d.offers.map((o) => `${o.city} (${o.pins.join(", ")})`).join("; ")}.`);
  } else lines.push(`Nothing to do right now. ${whatWouldChange(ctx.input, id)}`);
  return { lines };
}

function training(id: string, ctx: AssistantContext): Reply {
  const d = ctx.result.decisions[id];
  const a = ctx.input.applications.find((x) => x.id === id)!;
  if (d.status !== "approved" && d.status !== "conditional")
    return { lines: [head(d, a.name), `Training is planned once an applicant is approved. ${id} is ${STATUS_LABEL[d.status].toLowerCase()} right now.`] };
  const p = trainingPlan(a, d);
  const lines = [head(d, a.name), `${p.programme}: ${p.duration}, in ${p.language}.`];
  if (p.focus.length) {
    lines.push("Extra focus:");
    for (const f of p.focus) lines.push(`- ${f.module}: ${f.why}`);
  }
  return { lines };
}

function whatIf(ids: string[], text: string, ctx: AssistantContext, pending: PendingChange | null | undefined, forced?: Change): Reply {
  const id = ids[0] ?? pending?.id;
  const app = ctx.input.applications.find((a) => a.id === id);
  if (!id || !app) return { lines: ["Which applicant? Please include the application number, for example APP-012."] };
  const parsed = forced ? { change: forced, assumed: [] as string[], missing: [] as string[] } : parseChange(text, app);
  const change: Change = { ...(pending && pending.id === id ? pending.change : {}), ...parsed.change };
  const carried = pending && pending.id === id ? pending.assumed.filter((x) => !(parsed.change.space && x.startsWith("rented"))) : [];
  const assumed = [...new Set([...carried, ...parsed.assumed])];
  if (!hasFields(change))
    return { lines: [`I couldn't tell what changed for ${id}. Try: "${id} found a ground-floor shop, 450 sq ft, rented" or "${id} can now invest 30 lakh".`] };

  const sizeNow = change.size ?? app.size ?? null;
  const spaceNow = change.space ?? app.space;
  const missing = (spaceNow === "Owned" || spaceNow === "Rented") && sizeNow === null ? ["the size of the space in sq ft"] : [];
  const provisional = missing.length > 0;
  const after = run(withChange(ctx.input, id, change, provisional));
  const names = Object.fromEntries(ctx.input.applications.map((a) => [a.id, a.name]));
  const rows = diff(ctx.result, after, names, id);
  const d1 = ctx.result.decisions[id];
  const d2 = after.decisions[id];

  const lines: string[] = [];
  lines.push(`**${id} · ${fmtStatus(d1)} → ${fmtStatus(d2)}**`);
  const changedWords = Object.entries(change)
    .map(([k, v]) => `${k === "size" ? "size" : k} ${v}${k === "size" ? " sq ft" : k === "investment" ? " lakh" : ""}`)
    .join(", ");
  lines.push(`If ${id} changes: ${changedWords}.`);
  if (assumed.length) lines.push(`I assumed: ${assumed.join("; ")}.`);
  if (d1.score !== null && d2.score !== null && d1.score !== d2.score) lines.push(`Score: ${d1.score} → ${d2.score}.`);
  const unchanged = rows.length === 0 || (rows.length === 1 && rows[0].was === rows[0].now);
  lines.push("", "Because:");
  for (const r of d2.reasons.slice(0, 3)) lines.push(`- ${r}`);
  if (unchanged) lines.push("", "Nobody's result changes.");
  else {
    const others = rows.filter((r) => r.id !== id);
    if (others.length) {
      lines.push("", `Also affected (${others.length}):`);
      for (const r of others) lines.push(`- ${r.id} (${r.name || "name not provided"}): ${r.was} → ${r.now}. ${r.why}`);
    }
  }
  if (missing.length) {
    lines.push("", `I still need ${missing.join(" and ")} to make this final. Tell me, for example "${id} space is 450 sq ft". The result above scores the missing size as unknown.`);
  } else lines.push("", "This is a preview. Nothing is saved until you press Save this change.");
  return { lines, whatIf: { id, change, provisional, missing, assumed, rows }, pending: missing.length ? { id, change, assumed } : null };
}

function listBy(status: Status, ctx: AssistantContext, title: string): Reply {
  const ids = ctx.input.applications.map((a) => a.id).filter((id) => ctx.result.decisions[id]?.status === status);
  if (!ids.length) return { lines: [`**${title}**`, "Nobody right now."] };
  const lines = [`**${title}: ${ids.length}**`];
  for (const id of ids.slice(0, 20)) {
    const d = ctx.result.decisions[id];
    const name = ctx.input.applications.find((a) => a.id === id)?.name || "name not provided";
    lines.push(`- ${id} (${name}): ${status === "needs_info" ? d.ask : d.verdict}`);
  }
  return { lines };
}

export function answer(question: string, ctx: AssistantContext, pending?: PendingChange | null): Reply {
  const q = question.trim();
  const t = q.toLowerCase();
  const apps = ctx.input.applications;
  if (apps.length === 0) return { lines: ["There are no applications yet. Import a spreadsheet first, then ask me about any applicant."] };
  const ids = findIds(q, apps);
  const unknownId = /\bapp[-\s]?\d+/i.test(q) && ids.length === 0;
  if (unknownId) return { lines: ["I couldn't find that application number in the current list."], pending };

  if (/(approve|accept|select|pass|shortlist|promote)[^.]*(anyway|regardless|no matter)|skip (the )?rules|ignore (the )?rules|bypass|force[- ]approve/.test(t)) {
    return {
      lines: [
        "I can't skip the rules. Every approval has to respect one store per pin code and the number of openings in each area.",
        ids[0] ? `If the team has a good reason to decide differently for ${ids[0]}, open the applicant and use **Change this decision**. It asks for a reason and keeps a record.` : "If the team has a good reason to decide differently, open the applicant and use **Change this decision**. It asks for a reason and keeps a record.",
      ],
    };
  }

  const asksQuestion = /^\s*(why|who|how|what|which|when|where|is|are|does|do|did|show|list|tell|explain)\b|\?\s*$/.test(t) && !/\b(what if|suppose)\b/.test(t);
  const statesNews = /\b(managed to|lease[ds]?|signed|booked|arranged|secured|finali[sz]ed|found|got|bought|moved|changed|updated|raised|increased|now|just|has|have|had|can)\b/.test(t);
  const isWhatIf =
    /\b(what if|suppose|if )/.test(t) ||
    /(now|just|has|have|had) (found|got|secured|signed|raised|increased|bought|moved|changed|owns?|rented)|found a|now (has|have|owns?|can)|increased|raised|changed (his|her|their|the)|updated|moved to|\bis now\b/.test(t) ||
    (!asksQuestion && statesNews);
  if (ids.length && isWhatIf) {
    const parsed = parseChange(q, apps.find((a) => a.id === ids[0]));
    if (hasFields(parsed.change)) return whatIf(ids, q, ctx, pending);
    return {
      needsAi: { task: "parseChange", id: ids[0] },
      lines: [`I couldn't tell what changed for ${ids[0]}. Try: "${ids[0]} found a ground-floor shop, 450 sq ft, rented" or "${ids[0]} can now invest 30 lakh".`],
      pending,
    };
  }
  if (!ids.length && pending) {
    const parsed = parseChange(q, apps.find((a) => a.id === pending.id));
    if (hasFields(parsed.change)) return whatIf([], q, ctx, pending);
  }

  if (ids.length) {
    const id = ids[0];
    if (/\bahead\b|before (him|her|them)|ranked above|who (is|are) (in front|first)/.test(t)) return ahead(id, ctx);
    if (/train|learn|course|programme|program\b/.test(t)) return training(id, ctx);
    if (/next|need to do|what (should|do|does|must)|steps?|todo|to do/.test(t) && !/why/.test(t)) return next(id, ctx);
    if (/why|reason|explain|how come|because|hold|waiting|rejected|not eligible|approved|status|decision|what happened|score/.test(t)) return why(id, ctx);
    return why(id, ctx);
  }

  if (/(shortlist|top (five|5)|start with|start here|which five|first five)/.test(t)) {
    if (!ctx.result.shortlist.length) return { lines: ["Nobody is approved yet, so there is nothing to start with."] };
    const lines = ["**Start with these**"];
    ctx.result.shortlist.forEach((s, i) => {
      const a = apps.find((x) => x.id === s.id);
      lines.push(`${i + 1}. ${s.id} (${a?.name || "name not provided"}) — ${a?.city}, value ${s.value}. Score plus a bonus when the area is a priority.`);
    });
    return { lines };
  }
  if (/\b(full|filled|no openings|fill)\b|which areas|area/.test(t)) {
    const full = ctx.result.territories.filter((r) => r.territory.slots > 0 && r.openingsLeft === 0);
    const empty = ctx.result.territories.filter((r) => r.openingsLeft > 0);
    const lines = ["**Areas**"];
    lines.push(full.length ? `Full: ${full.map((r) => `${r.territory.id} (${r.territory.city}, ${r.territory.slots}/${r.territory.slots})`).join(", ")}.` : "No area is full.");
    if (empty.length) lines.push(`Still open: ${empty.map((r) => `${r.territory.id} (${r.openingsLeft} of ${r.territory.slots} left)`).join(", ")}.`);
    return { lines };
  }
  if (/needs? info|missing|on hold|\bhold\b|incomplete|blocked/.test(t)) return listBy("needs_info", ctx, "Needs information");
  if (/waiting|waitlist/.test(t)) return listBy("waiting", ctx, "Waiting list");
  if (/not eligible|rejected|declined/.test(t)) return listBy("not_eligible", ctx, "Not eligible right now");
  if (/condition/.test(t)) return listBy("conditional", ctx, "Approved with a condition");
  if (/approved|who (got|has) (an )?opening/.test(t)) return listBy("approved", ctx, "Approved to proceed");
  if (/summary|overview|how many|count|status|everyone|all applicants/.test(t)) {
    const counts = (Object.keys(STATUS_LABEL) as Status[]).map((s) => `${STATUS_LABEL[s]}: ${Object.values(ctx.result.decisions).filter((d) => d.status === s).length}`);
    return { lines: [`**${apps.length} applications**`, ...counts] };
  }
  return {
    needsAi: { task: "ask" },
    lines: [
      "I can answer questions about the decisions already made. Try:",
      '- "Why is APP-007 on the waiting list?"',
      '- "Who is ahead of APP-004?"',
      '- "What does APP-012 need to do next?"',
      '- "How will APP-009 be trained?"',
      '- "Which five should we start with?"',
      '- "Which areas are full?"',
      '- "Show everyone who needs information"',
      '- "APP-012 found a ground-floor shop, 400 sq ft, rented"',
    ],
  };
}

/** Applies a change that the assistant service read from the team's sentence. */
export function answerWithChange(id: string, change: Change, ctx: AssistantContext, pending?: PendingChange | null): Reply {
  return whatIf([id], "", ctx, pending, change);
}
