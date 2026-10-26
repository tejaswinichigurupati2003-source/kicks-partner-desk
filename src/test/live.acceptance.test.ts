import { describe, expect, it } from "vitest";
import { run } from "@/engine/run";
import { normaliseWorkspace, toRunInput, type Workspace } from "@/lib/workspace";
import type { DiffCard } from "@/lib/diffcard";

const BASE = process.env.LIVE_URL;

/** One browser session: remembers the run cookie the site sets. */
class Session {
  private cookie = "";
  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: this.cookie, "x-actor": "Acceptance check" }, redirect: "manual" });
    for (const c of res.headers.getSetCookie?.() ?? []) this.cookie = `${c.split(";")[0]}`;
    return res;
  }
  async practice() {
    const res = await this.call("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practice: true }) });
    return (await res.json()) as { ok: boolean; id: string };
  }
  async data() {
    const j = (await (await this.call("/api/run")).json()) as { ok: boolean; id: string; rev: number; data: Workspace };
    const ws = normaliseWorkspace(j.data);
    return { ws, id: j.id, rev: j.rev, result: run(toRunInput(ws)) };
  }
  async chat(message: string) {
    const res = await this.call("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    return (await res.json()) as { ok: boolean; reply: { text: string; cards: DiffCard[] }; saved: boolean; ai: boolean };
  }
  async apply(action: { tool: string; args: Record<string, unknown> }) {
    const res = await this.call("/api/run/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    return (await res.json()) as { ok: boolean; card?: DiffCard; text?: string };
  }
  async join(id: string) {
    return this.call(`/run/${id}`);
  }
  async events() {
    return (await (await this.call("/api/run/events?limit=50")).json()) as { ok: boolean; events: { trigger: string; application_id: string | null; summary: string; actor: string }[] };
  }
}

describe.skipIf(!BASE)("live site: acceptance", () => {
  it("imports the practice data into a run with its own UUID and a shareable link", async () => {
    const s = new Session();
    const made = await s.practice();
    expect(made.ok).toBe(true);
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/);
    const other = new Session();
    expect((await other.join(made.id)).status).toBe(307);
    expect((await other.data()).ws.applications.length).toBe(24);
    expect((await new Session().data()).ws.applications.length).toBe(0);
  }, 60_000);

  it("engine: Redirected, Not in current plan, minimum score, money rule, tie-break", async () => {
    const s = new Session();
    await s.practice();
    const { result, ws } = await s.data();
    const d = result.decisions;
    expect(d["APP-006"].status).toBe("redirected");
    expect(d["APP-006"].redirectPin).toBe("570004");
    expect(d["APP-006"].territoryId).toBe("TER-02");
    expect(d["APP-015"].status).toBe("redirected");
    expect(["590003", "590005"]).toContain(d["APP-015"].redirectPin);
    expect(d["APP-005"].assignedPin).not.toBe("570008");
    expect(d["APP-005"].verdict).toMatch(/overall fit too low/);
    expect(d["APP-007"].verdict).toMatch(/12% below/);
    expect(d["APP-009"].status).toBe("conditional");
    expect(d["APP-009"].reasons.join(" ")).toMatch(/5\.7% below/);
    expect(d["APP-014"].verdict).toMatch(/44\.4% below/);
    expect(d["APP-021"].status).toBe("not_in_plan");
    expect(d["APP-022"].status).toBe("not_in_plan");
    expect(d["APP-008"].status).toBe("needs_info");
    expect(d["APP-024"].reasonTrail.some((t) => t.check === "Tie-break")).toBe(true);
    expect(result.problems).toEqual([]);
    const by = Object.fromEntries(ws.applications.map((a) => [a.id, a]));
    expect(by["APP-023"].language).toBe("Kannada");
    expect(by["APP-012"].pin).toBe("560010");
    expect(ws.health?.exampleRowSkipped).toBe(true);
    expect(ws.health?.changes.length).toBeGreaterThan(0);
  }, 60_000);

  it("chat 1: compares APP-005 and APP-003 and corrects the premise", async () => {
    const s = new Session();
    await s.practice();
    const r = await s.chat("Why is APP-005 approved at 32 while APP-003 at 87 is waitlisted?");
    expect(r.ok).toBe(true);
    expect(r.reply.text).toMatch(/APP-005/);
    expect(r.reply.text).toMatch(/APP-003/);
    expect(r.reply.text).toMatch(/not approved|isn't approved|is not approved|wasn't approved|not eligible/i);
    expect(r.reply.text).toMatch(/570001/);
    expect(r.saved).toBe(false);
  }, 90_000);

  it("chat 2: 'APP-002 has withdrawn' saves, promotes APP-003 to 570001 and returns a diff card with Undo", async () => {
    const s = new Session();
    await s.practice();
    const r = await s.chat("APP-002 has withdrawn");
    expect(r.saved).toBe(true);
    const card = r.reply.cards[0];
    expect(card.target?.id).toBe("APP-002");
    expect(card.target?.now).toMatch(/Withdrawn/);
    const three = card.knockOn.find((l) => l.id === "APP-003");
    expect(three?.afterPin).toBe("570001");
    expect(card.undoable).toBe(true);
    const { result } = await s.data();
    expect(result.decisions["APP-002"].status).toBe("withdrawn");
    expect(result.decisions["APP-003"].assignedPin).toBe("570001");
    const ev = await s.events();
    expect(ev.events.some((e) => e.trigger === "chat" && e.application_id === "APP-003")).toBe(true);
    expect(ev.events.some((e) => e.actor === "Acceptance check")).toBe(true);
  }, 90_000);

  it("chat 3: 'found a shop' asks one question and saves nothing; the full answer saves and the score rises", async () => {
    const s = new Session();
    await s.practice();
    const before = (await s.data()).result.decisions["APP-012"].score!;
    const ask = await s.chat("APP-012 found a shop");
    expect(ask.saved).toBe(false);
    expect(ask.reply.text).toMatch(/owned or rented/i);
    expect((await s.data()).result.decisions["APP-012"].score).toBe(before);
    const done = await s.chat("APP-012 found a 450 sq ft ground-floor rented shop");
    expect(done.saved).toBe(true);
    const after = (await s.data()).result.decisions["APP-012"].score!;
    expect(after).toBeGreaterThan(before);
  }, 120_000);

  it("chat 4: 'Add one opening to TER-03' gives APP-012 an outcome", async () => {
    const s = new Session();
    await s.practice();
    expect((await s.data()).result.decisions["APP-012"].status).toBe("waiting");
    const r = await s.chat("Add one opening to TER-03");
    expect(r.saved).toBe(true);
    const { result } = await s.data();
    expect(result.decisions["APP-012"].status).toBe("redirected");
    expect(r.reply.cards[0].knockOn.concat(r.reply.cards[0].target ? [r.reply.cards[0].target] : []).some((l) => l.id === "APP-012")).toBe(true);
  }, 90_000);

  it("chat 5: explains the APP-006 redirect from the stored trail", async () => {
    const s = new Session();
    await s.practice();
    const r = await s.chat("Why is APP-006 redirected?");
    expect(r.reply.text).toMatch(/570004/);
    expect(r.reply.text).toMatch(/570009|ST-06|store/i);
  }, 90_000);

  it("chat 6: declines 'approve anyway' and points to Change this decision", async () => {
    const s = new Session();
    await s.practice();
    const r = await s.chat("Approve APP-005 anyway");
    expect(r.saved).toBe(false);
    expect(r.reply.text).toMatch(/can't|cannot|won't|not able/i);
    expect(r.reply.text).toMatch(/Change this decision/i);
  }, 90_000);

  it("status link: a short /s/ token shows only that applicant's current decision", async () => {
    const s = new Session();
    await s.practice();
    const links = (await (await fetch(`${BASE}/api/run/links`, { headers: { cookie: (s as unknown as { cookie: string }).cookie } })).json()) as { links: Record<string, string> };
    const url = links.links["APP-006"];
    expect(url).toMatch(/\/s\/[A-Za-z0-9]{6}$/);
    const html = await (await fetch(url)).text();
    expect(html).toMatch(/Redirected/);
    expect(html).toMatch(/570004/);
    expect(html).not.toMatch(/APP-005|APP-002|score/i);
  }, 60_000);

  it("what-if never saves: preview card, nothing in the audit log, then Apply saves with Undo", async () => {
    const s = new Session();
    await s.practice();
    const auditBefore = (await s.events()).events.length;
    const r = await s.chat("What happens if we raise the minimum score to 60?");
    expect(r.ok).toBe(true);
    expect(r.saved).toBe(false);
    expect(r.reply.cards).toHaveLength(1);
    const card = r.reply.cards[0];
    expect(card.preview).toBe(true);
    expect(card.undoable).toBe(false);
    expect(card.summary).toMatch(/45 → 60/);
    expect(r.reply.text.split(String.fromCharCode(10))).toHaveLength(1);
    expect(r.reply.text).toMatch(/Preview only/);
    const rows = [card.target, ...card.knockOn].filter(Boolean);
    expect(rows.some((l) => l!.id === "APP-012" && /Not eligible/.test(l!.now))).toBe(true);
    const after = await s.data();
    expect(after.ws.assumptions.minScoreToAllocate ?? 45).toBe(45);
    expect((await s.events()).events.length).toBe(auditBefore);

    const applied = await s.apply(card.action!);
    expect(applied.ok).toBe(true);
    expect(applied.card?.undoable).toBe(true);
    expect(applied.card?.preview).toBeUndefined();
    expect((await s.data()).ws.assumptions.minScoreToAllocate).toBe(60);
    expect((await s.events()).events.some((e) => e.trigger === "assumption")).toBe(true);
  }, 90_000);

  it("a saved change gets a one-line reply plus the card and an audit entry, and compare works", async () => {
    const s = new Session();
    await s.practice();
    const r = await s.chat("APP-002 has withdrawn");
    expect(r.saved).toBe(true);
    expect(r.reply.text.split(String.fromCharCode(10))).toHaveLength(1);
    expect(r.reply.cards).toHaveLength(1);
    expect(r.reply.cards[0].undoable).toBe(true);
    const { result } = await s.data();
    expect(result.decisions["APP-002"].status).toBe("withdrawn");
    expect((await s.events()).events.some((e) => e.application_id === null && /APP-002/.test(e.summary))).toBe(true);
    const c = await s.chat("Compare APP-003 and APP-005");
    expect(c.reply.text).toMatch(/APP-003/);
    expect(c.reply.text).toMatch(/APP-005/);
    expect(c.saved).toBe(false);
  }, 90_000);

  it("reasons match the final status and suggestions are only concrete facts", async () => {
    const s = new Session();
    await s.practice();
    const { result } = await s.data();
    const d = result.decisions;
    expect(d["APP-005"].status).toBe("not_eligible");
    for (const t of d["APP-005"].reasonTrail) expect(t.detail).not.toMatch(/approval carries a condition/);
    expect(d["APP-003"].suggestions).toEqual([]);
    expect(d["APP-012"].suggestions).toHaveLength(1);
    expect(d["APP-012"].suggestions[0]).toMatch(/^Suggested update: /);
    for (const dec of Object.values(d)) for (const t of dec.reasonTrail) expect(t.detail).not.toMatch(/targetMonths|experienceYears|investmentLakh/);
  }, 60_000);
});
