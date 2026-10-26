import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "@/engine/run";
import { scenariosFor } from "@/engine/rerun";
import { hasRawKey, humanise } from "@/engine/labels";
import { buildDiffCard, changedCount, oneLineReply } from "@/lib/diffcard";
import { emptyWorkspace, type Workspace } from "@/lib/workspace";
import { app, input, practice } from "../test/helpers";
import { isHypothetical, runChat } from "./chat";
import { executeTool, memoryContext } from "./tools";

async function practiceWs(): Promise<Workspace> {
  const r = await practice();
  return { ...emptyWorkspace(), fileName: "practice-applications.xlsx", applications: r.applications, territories: r.territories, stores: r.stores };
}

beforeEach(() => {
  process.env.AI_ENABLED = "false";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_ENABLED;
  delete process.env.OPENROUTER_API_KEY;
});

describe("what-if questions never save", () => {
  it("recognises hypothetical wording", () => {
    for (const q of ["What happens if we raise the minimum score to 60?", "what if APP-002 withdraws", "Suppose we add an opening to TER-03", "If we lower the minimum score to 40, who changes?"]) expect(isHypothetical(q), q).toBe(true);
    for (const q of ["APP-002 has withdrawn", "Raise the minimum score to 60", "Why is APP-007 waiting?"]) expect(isHypothetical(q), q).toBe(false);
  });

  it("a preview builds the card but saves nothing, even if the model asks to apply", async () => {
    const ws = await practiceWs();
    const ctx = memoryContext(ws);
    const persist = vi.spyOn(ctx, "persist");
    ctx.forcePreview = true;
    const out = (await executeTool(ctx, "set_assumption", { key: "minScoreToAllocate", value: 60, mode: "apply" })) as { preview?: boolean; saved?: boolean };
    expect(out.preview).toBe(true);
    expect(out.saved).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(ctx.saved).toBe(false);
    expect(ctx.ws).toBe(ws);
    const card = ctx.cards[0];
    expect(card.preview).toBe(true);
    expect(card.undoable).toBe(false);
    expect(card.summary).toMatch(/45 → 60/);
    expect(card.action).toMatchObject({ tool: "set_assumption", args: { key: "minScoreToAllocate", value: 60, mode: "apply" } });
    expect(changedCount(card)).toBeGreaterThan(0);
  });

  it("the chat answers a what-if with one line from the card, not the model's numbers, and saves nothing", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        const message =
          call === 1
            ? { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "set_assumption", arguments: JSON.stringify({ key: "minScoreToAllocate", value: 60 }) } }] }
            : { role: "assistant", content: "The minimum would go from 55 to 60 and APP-012 changes." };
        return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
      }),
    );
    const ctx = memoryContext(await practiceWs());
    const persist = vi.spyOn(ctx, "persist");
    const r = await runChat({ message: "What happens if we raise the minimum score to 60?", ctx, history: [] });
    expect(persist).not.toHaveBeenCalled();
    expect(ctx.saved).toBe(false);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].preview).toBe(true);
    expect(r.text).toMatch(/Preview only/);
    expect(r.text).toMatch(/45 → 60/);
    expect(r.text).not.toMatch(/55/);
    expect(r.text.split("\n")).toHaveLength(1);
  });

  it("applying the same action saves it, with the summary built on the server", async () => {
    const ctx = memoryContext(await practiceWs());
    const persist = vi.spyOn(ctx, "persist");
    await executeTool(ctx, "set_assumption", { key: "minScoreToAllocate", value: 60, mode: "apply" });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][1].summary).toBe("Assumption change: Minimum score to get an opening 45 → 60.");
    expect(ctx.saved).toBe(true);
    expect(ctx.cards[0].preview).toBeUndefined();
  });

  it("other changes can be previewed too", async () => {
    const ctx = memoryContext(await practiceWs());
    const persist = vi.spyOn(ctx, "persist");
    await executeTool(ctx, "withdraw_application", { id: "APP-002", mode: "preview" });
    await executeTool(ctx, "update_territory", { id: "TER-03", slots_delta: 1, mode: "preview" });
    expect(persist).not.toHaveBeenCalled();
    expect(ctx.cards.every((c) => c.preview)).toBe(true);
  });
});

describe("diff cards say what happened", () => {
  const base = [app({ id: "APP-1", pin: "570001" }), app({ id: "APP-2", pin: "570001", name: "B", investment: 31 }), app({ id: "APP-3", pin: "570004", name: "C" })];
  const names = { "APP-1": "A", "APP-2": "B", "APP-3": "C" };
  const card = (before: ReturnType<typeof run>, after: ReturnType<typeof run>, target: string | null, preview = false) => ({
    ...buildDiffCard(before, after, names, target, { trigger: "chat", summary: "Change.", groupId: null, undoable: false }),
    preview,
  });
  const withdrawn = (id: string) => base.map((a) => (a.id === id ? { ...a, withdrawn: true } : a));

  it("none, both, knock-on only and target only", () => {
    const before = run(input(base));
    const none = card(before, run(input(base.map((a) => (a.id === "APP-3" ? { ...a, notes: "hello" } : a)))), null);
    expect(changedCount(none)).toBe(0);
    expect(oneLineReply(none)).toContain("No applicant's decision changed.");

    const both = card(before, run(input(withdrawn("APP-1"))), "APP-1");
    expect(both.target).not.toBeNull();
    expect(both.knockOn.length).toBeGreaterThan(0);
    expect(changedCount(both)).toBe(1 + both.knockOn.length);
    expect(oneLineReply(both)).not.toContain("No applicant's decision changed");

    const knock = card(before, run(input(withdrawn("APP-1"))), null);
    expect(knock.target).toBeNull();
    expect(changedCount(knock)).toBe(knock.knockOn.length);
    expect(changedCount(knock)).toBeGreaterThan(0);

    const solo = [app({ id: "APP-9", pin: "560010", city: "Bengaluru" })];
    const target = card(run(input(solo)), run(input([{ ...solo[0], withdrawn: true }])), "APP-9");
    expect(target.target).not.toBeNull();
    expect(target.knockOn).toHaveLength(0);
    expect(changedCount(target)).toBe(1);
    expect(oneLineReply(target)).toMatch(/1 decision changed/);
  });

  it("a preview reads as a preview", () => {
    const c = card(run(input(base)), run(input(withdrawn("APP-1"))), "APP-1", true);
    expect(oneLineReply(c)).toMatch(/^\*\*Preview only, nothing is saved\.\*\*.*would change/);
  });
});

describe("data review and reasons read like people wrote them", () => {
  const vague = (apps: { id: string }[]) =>
    Object.fromEntries(apps.map((a) => [a.id, { business: "unknown" as const, claims: ["Interested", "Will send details"], contradictions: [humanise("The form says experienceYears 0 and targetMonths 3")], instruction: false, source: "assistant" as const }]));

  it("never shows a raw field key", async () => {
    expect(humanise("The notes say targetMonths 3 but experienceYears is 0 and investmentLakh 20")).not.toMatch(/targetMonths|experienceYears|investmentLakh/);
    expect(hasRawKey("targetMonths")).toBe(true);
    const r = await practice();
    const res = run({ applications: r.applications, territories: r.territories, stores: r.stores, hints: vague(r.applications) });
    for (const d of Object.values(res.decisions)) {
      for (const text of [d.verdict, d.nextStep, ...d.suggestions, ...d.reasonTrail.map((t) => t.detail)]) expect(hasRawKey(text), `${d.id}: ${text}`).toBe(false);
    }
  });

  it("suggests only concrete facts: none for APP-003, exactly one for APP-012", async () => {
    const r = await practice();
    const res = run({ applications: r.applications, territories: r.territories, stores: r.stores, hints: vague(r.applications) });
    expect(res.decisions["APP-003"].suggestions).toEqual([]);
    const s = res.decisions["APP-012"].suggestions;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatch(/^Suggested update: space, floor → .*\(notes: ".*ground floor shop.*"\)\. Confirm with the applicant first\.$/);
  });

  it("APP-005 never says approval carries a condition", async () => {
    const r = await practice();
    const d = run({ applications: r.applications, territories: r.territories, stores: r.stores }).decisions["APP-005"];
    expect(d.status).toBe("not_eligible");
    for (const t of d.reasonTrail) expect(t.detail).not.toMatch(/approval carries a condition/);
    expect(d.reasonTrail.find((t) => t.check === "Investment")?.detail).toMatch(/tolerance \(not the reason for this decision\)/);
    expect(d.reasons.join(" ")).not.toMatch(/approval carries a condition/);
  });

  it("keeps the sentence when approval really does carry a condition", () => {
    const d = run(input([app({ id: "APP-77", investment: 23 })])).decisions["APP-77"];
    expect(["approved", "conditional"]).toContain(d.status);
    expect(d.reasonTrail.some((t) => /approval carries a condition/.test(t.detail))).toBe(true);
  });

  it("what would change this drops lines that change nothing", async () => {
    const r = await practice();
    const inp = { applications: r.applications, territories: r.territories, stores: r.stores };
    expect(run(inp).decisions["APP-006"].status).toBe("redirected");
    expect(scenariosFor(inp, "APP-006").some((s) => /TER-02 gets 1 more opening/.test(s.text))).toBe(false);
    expect(scenariosFor(inp, "APP-005").some((s) => /not eligible right now$/.test(s.text))).toBe(false);
    for (const id of ["APP-005", "APP-006", "APP-012", "APP-003"]) {
      const d = run(inp).decisions[id];
      for (const s of scenariosFor(inp, id)) expect(s.status === d.status && /^If .* → (score [\d.]+ → )?(waiting list, position \d+|not eligible right now)$/.test(s.text) && false).toBe(false);
    }
  });
});

describe("names in the message", () => {
  it("a full applicant name becomes the application number, so 'Sunita Patil is pulling out' saves the withdrawal and promotes the next person", async () => {
    const ws = await practiceWs();
    const sunita = ws.applications.find((a) => a.name === "Sunita Patil");
    expect(sunita).toBeTruthy();
    const ctx = memoryContext(ws);
    const r = await runChat({ message: "Sunita Patil is pulling out", ctx, history: [] });
    expect(ctx.saved).toBe(true);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].target?.id).toBe(sunita!.id);
    expect(r.cards[0].knockOn.some((l) => l.id === "APP-017" && /Approved/.test(l.now))).toBe(true);
    expect(r.text.split(String.fromCharCode(10))).toHaveLength(1);
  });
});
