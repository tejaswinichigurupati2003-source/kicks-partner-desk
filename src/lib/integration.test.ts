import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { fallbackChat } from "@/engine/assistant";
import { run } from "@/engine/run";
import type { ToolContext } from "@/ai/tools";
import { practice } from "../test/helpers";
import { createRun, listEvents, loadRun, saveRun, statusTokens, resolveToken, undoGroup } from "./runs";
import { emptyWorkspace, toRunInput } from "./workspace";

/** Reads .env.local so the test can reach the database when one is set up. */
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local: the test is skipped */
  }
}
loadEnv();

const hasDb = !!process.env.DATABASE_URL;
const created: string[] = [];

afterAll(async () => {
  if (!hasDb) return;
  const sql = neon(process.env.DATABASE_URL as string);
  for (const id of created) await sql`DELETE FROM runs WHERE id = ${id}::uuid`;
});

describe.skipIf(!hasDb)("a run in the database", () => {
  it("import practice data, withdraw APP-002 in chat, APP-003 is promoted, and the events are recorded", async () => {
    const read = await practice();
    const ws = { ...emptyWorkspace(), fileName: "practice-applications.xlsx", applications: read.applications, territories: read.territories, stores: read.stores, report: read.report.messages, health: read.health };
    const { id } = await createRun(ws, { actor: "Integration run", summary: "Imported practice data." });
    created.push(id);

    const first = await loadRun(id);
    expect(first?.rev).toBe(1);
    expect(run(toRunInput(first!.data)).decisions["APP-003"].status).toBe("waiting");

    // The same path the chat route uses.
    const ctx: ToolContext = {
      ws: first!.data,
      rev: first!.rev,
      actor: "Integration run",
      cards: [],
      saved: false,
      persist: async (next, meta) => {
        const res = await saveRun(id, next, ctx.rev, meta);
        return res.ok ? { ok: true, rev: res.rev, card: res.card } : { ok: false, conflict: true };
      },
    };
    const reply = await fallbackChat("APP-002 has withdrawn", ctx);
    expect(reply.text).toMatch(/Saved/);
    expect(reply.cards).toHaveLength(1);
    const card = reply.cards[0];
    expect(card.target).toMatchObject({ id: "APP-002" });
    expect(card.target!.now).toMatch(/Withdrawn/);
    expect(card.knockOn.find((k) => k.id === "APP-003")?.afterPin).toBe("570001");
    expect(card.undoable).toBe(true);
    expect(card.groupId).toBeTruthy();

    // What was saved is what the next person loads.
    const saved = await loadRun(id);
    expect(saved?.rev).toBe(2);
    const decisions = run(toRunInput(saved!.data)).decisions;
    expect(decisions["APP-002"].status).toBe("withdrawn");
    expect(decisions["APP-003"].assignedPin).toBe("570001");
    expect(["approved", "conditional"]).toContain(decisions["APP-003"].status);

    // decision_events has the change, with before and after.
    const events = await listEvents(id);
    const chat = events.filter((e) => e.trigger === "chat");
    expect(chat.length).toBeGreaterThanOrEqual(3);
    expect(chat.every((e) => e.actor === "Integration run")).toBe(true);
    expect(chat.find((e) => e.application_id === null)?.summary).toMatch(/APP-002 withdrew/);
    const promoted = chat.find((e) => e.application_id === "APP-003");
    expect(promoted?.before).toMatchObject({ status: "waiting" });
    expect(promoted?.after).toMatchObject({ pin: "570001" });
    expect(await listEvents(id, { applicationId: "APP-003" })).toHaveLength(1);
    expect(events.some((e) => e.trigger === "import")).toBe(true);

    // The readable tables follow along.
    const sql = neon(process.env.DATABASE_URL as string);
    const row = await sql`SELECT status, assigned_pin FROM decisions WHERE run_id = ${id}::uuid AND application_id = 'APP-003'`;
    expect(row[0]).toMatchObject({ status: decisions["APP-003"].status, assigned_pin: "570001" });
    const stores = await sql`SELECT count(*)::int AS n FROM existing_stores`;
    expect(stores[0].n).toBe(10);

    // A stale save is refused, never merged silently.
    const stale = await saveRun(id, saved!.data, 1, { trigger: "edit", actor: "Someone", summary: "Stale." });
    expect(stale.ok).toBe(false);

    // Undo puts it back.
    const undone = await undoGroup(id, card.groupId!, "Integration run");
    expect(undone.ok).toBe(true);
    const restored = run(toRunInput((await loadRun(id))!.data)).decisions;
    expect(restored["APP-002"].status).toMatch(/approved|conditional/);
    expect(restored["APP-003"].status).toBe("waiting");
    expect((await undoGroup(id, card.groupId!, "Integration run")).ok).toBe(false);
  }, 90_000);

  it("gives every applicant one short status link that opens the live decision", async () => {
    const read = await practice();
    const ws = { ...emptyWorkspace(), fileName: "practice-applications.xlsx", applications: read.applications.slice(0, 3), territories: read.territories, stores: read.stores };
    const { id } = await createRun(ws, { actor: "Integration run", summary: "Imported practice data." });
    created.push(id);
    const ids = ws.applications.map((a) => a.id);
    const tokens = await statusTokens(id, ids);
    expect(Object.keys(tokens).sort()).toEqual([...ids].sort());
    for (const t of Object.values(tokens)) expect(t).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(await statusTokens(id, ids)).toEqual(tokens);
    expect(await resolveToken(tokens[ids[0]])).toEqual({ runId: id, applicationId: ids[0] });
    expect(await resolveToken("zzzzzz")).toBeNull();
  }, 60_000);
});
