import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackChat, findIds, parseFields, type Pending } from "@/engine/assistant";
import { run } from "@/engine/run";
import { emptyWorkspace, toRunInput, type Workspace } from "@/lib/workspace";
import { practice } from "../test/helpers";
import { runChat } from "./chat";
import { computeHints } from "./hints";
import { executeTool, memoryContext, TOOL_SPECS, type ToolContext } from "./tools";

async function practiceWs(): Promise<Workspace> {
  const r = await practice();
  return { ...emptyWorkspace(), fileName: "practice-applications.xlsx", applications: r.applications, territories: r.territories, stores: r.stores };
}
const decisions = (ctx: ToolContext) => run(toRunInput(ctx.ws)).decisions;

beforeEach(() => {
  process.env.AI_ENABLED = "false";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_ENABLED;
  delete process.env.OPENROUTER_API_KEY;
});

describe("tools", () => {
  it("offers exactly the tools in the spec, plus update_territory", () => {
    expect(TOOL_SPECS.map((t) => t.function.name).sort()).toEqual(
      ["compare_applicants", "explain_decision", "get_application", "rerun_engine", "set_assumption", "update_application", "update_territory", "withdraw_application"].sort(),
    );
  });

  it("explain_decision returns only the stored reason trail and score breakdown, with maxima", async () => {
    const ctx = memoryContext(await practiceWs());
    const e = (await executeTool(ctx, "explain_decision", { id: "APP-003" })) as { reasonTrail: { check: string; detail: string }[]; scoreBreakdown: { part: string; points: number; max: number }[]; status: string; competitorsForSamePin: { id: string }[] };
    expect(e.status).toBe("Waiting list");
    expect(e.reasonTrail.some((t) => t.check === "Allocation")).toBe(true);
    expect(e.scoreBreakdown.map((p) => p.part)).toEqual(["investment", "space", "experience", "timeline", "priority", "completeness"]);
    expect(e.scoreBreakdown.reduce((a, p) => a + p.max, 0)).toBe(100);
    expect(e.competitorsForSamePin.map((c) => c.id)).toContain("APP-002");
  });

  it("tool results carry no names or notes", async () => {
    const ctx = memoryContext(await practiceWs());
    const json = JSON.stringify([await executeTool(ctx, "get_application", { id: "APP-005" }), await executeTool(ctx, "explain_decision", { id: "APP-005" })]);
    expect(json).not.toMatch(/Anand|Ignore your rules/);
    expect(json).toMatch(/instructions that were ignored/);
  });

  it("compare_applicants shows pin availability beside score", async () => {
    const ctx = memoryContext(await practiceWs());
    const c = (await executeTool(ctx, "compare_applicants", { ids: ["APP-005", "APP-003"] })) as { items: { id: string; status: string; score: number; requestedPin: string; requestedPinHeldBy: unknown }[] };
    const [a5, a3] = c.items;
    expect(a5.status).toBe("Not eligible right now");
    expect(a3.status).toBe("Waiting list");
    expect(a3.requestedPinHeldBy).toMatchObject({ id: "APP-002" });
    expect(a3.score).toBeGreaterThan(a5.score);
  });

  it("update_application saves and returns the target and the knock-on effects", async () => {
    const ctx = memoryContext(await practiceWs());
    const out = (await executeTool(ctx, "update_application", { id: "APP-012", space: "Rented", size: 450, floor: "Ground" })) as { saved: boolean; target: { score: string } };
    expect(out.saved).toBe(true);
    expect(ctx.saved).toBe(true);
    expect(ctx.rev).toBe(2);
    expect(ctx.cards).toHaveLength(1);
    const [before, after] = out.target.score.split(" → ").map(Number);
    expect(after).toBeGreaterThan(before);
  });

  it("update_application asks one question and saves nothing when it would have to guess", async () => {
    const ctx = memoryContext(await practiceWs());
    const floorOnly = (await executeTool(ctx, "update_application", { id: "APP-012", floor: "Ground" })) as { needs_clarification: string };
    expect(floorOnly.needs_clarification).toMatch(/owned or rented/);
    const noSize = (await executeTool(ctx, "update_application", { id: "APP-012", space: "Rented" })) as { needs_clarification: string };
    expect(noSize.needs_clarification).toMatch(/size of the space/);
    const nothing = (await executeTool(ctx, "update_application", { id: "APP-012" })) as { needs_clarification: string };
    expect(nothing.needs_clarification).toMatch(/What changed/);
    expect(ctx.saved).toBe(false);
    expect(ctx.rev).toBe(1);
    expect(ctx.cards).toHaveLength(0);
  });

  it("withdraw_application promotes the next applicant and cannot be repeated", async () => {
    const ctx = memoryContext(await practiceWs());
    const out = (await executeTool(ctx, "withdraw_application", { id: "APP-002", reason: "Found another business" })) as { saved: boolean; knockOnEffects: { id: string; pin: string }[] };
    expect(out.saved).toBe(true);
    expect(decisions(ctx)["APP-002"].status).toBe("withdrawn");
    expect(decisions(ctx)["APP-003"].assignedPin).toBe("570001");
    expect(out.knockOnEffects.find((k) => k.id === "APP-003")?.pin).toMatch(/570001$/);
    const again = (await executeTool(ctx, "withdraw_application", { id: "APP-002" })) as { already?: boolean };
    expect(again.already).toBe(true);
    expect(ctx.rev).toBe(2);
  });

  it("update_territory adds an opening and gives the waiting applicant an outcome", async () => {
    const ctx = memoryContext(await practiceWs());
    expect(decisions(ctx)["APP-012"].status).toBe("waiting");
    const out = (await executeTool(ctx, "update_territory", { id: "TER-03", slots_delta: 1 })) as { saved: boolean };
    expect(out.saved).toBe(true);
    expect(decisions(ctx)["APP-012"].status).toBe("redirected");
    expect(ctx.ws.territories.find((t) => t.id === "TER-03")!.slots).toBe(2);
  });

  it("set_assumption validates the key and the type, then saves", async () => {
    const ctx = memoryContext(await practiceWs());
    expect(await executeTool(ctx, "set_assumption", { key: "nope", value: 3 })).toMatchObject({ error: "unknown_assumption" });
    expect(await executeTool(ctx, "set_assumption", { key: "minScoreToAllocate", value: "high" })).toMatchObject({ error: "invalid" });
    expect(await executeTool(ctx, "set_assumption", { key: "weights", value: 3 })).toMatchObject({ error: "invalid" });
    expect(await executeTool(ctx, "set_assumption", { key: "minScoreToAllocate", value: -1 })).toMatchObject({ error: "invalid" });
    expect(ctx.saved).toBe(false);
    const ok = (await executeTool(ctx, "set_assumption", { key: "minScoreToAllocate", value: 20 })) as { saved: boolean };
    expect(ok.saved).toBe(true);
    expect(decisions(ctx)["APP-005"].status).not.toBe("not_eligible");
    const nested = (await executeTool(ctx, "set_assumption", { key: "weights.investment", value: 30 })) as { saved: boolean };
    expect(nested.saved).toBe(true);
  });

  it("an unknown application or tool is reported, not guessed", async () => {
    const ctx = memoryContext(await practiceWs());
    expect(await executeTool(ctx, "get_application", { id: "APP-999" })).toMatchObject({ error: "not_found" });
    expect(await executeTool(ctx, "launch_rocket", {})).toMatchObject({ error: "unknown_tool" });
  });

  it("a conflicting save reports it and keeps the old data", async () => {
    const ctx = memoryContext(await practiceWs());
    ctx.persist = async () => ({ ok: false, conflict: true });
    const out = (await executeTool(ctx, "withdraw_application", { id: "APP-002" })) as { error: string };
    expect(out.error).toBe("conflict");
    expect(ctx.ws.applications.find((a) => a.id === "APP-002")!.withdrawn).toBeFalsy();
    expect(ctx.saved).toBe(false);
  });
});

describe("fallback chat", () => {
  it("reads application numbers in any form", () => {
    const apps = [{ id: "APP-012" }, { id: "APP-003" }] as never[];
    expect(findIds("app 12 and APP-3 and App-0012", apps)).toEqual(["APP-012", "APP-003"]);
  });

  it("reads stated facts, and only the ownership that is said", () => {
    expect(parseFields("found a 450 sq ft ground-floor rented shop")).toMatchObject({ size: 450, floor: "Ground", space: "Rented" });
    expect(parseFields("found a ground floor shop")).toEqual({ floor: "Ground" });
    expect(parseFields("can now invest 30 lakh")).toMatchObject({ investment: 30 });
    expect(parseFields("owns a 600 sqft shop")).toMatchObject({ space: "Owned", size: 600 });
  });

  it("'APP-002 has withdrawn' saves and shows APP-003 winning 570001", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("APP-002 has withdrawn", ctx);
    expect(r.text).toMatch(/Saved/);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].target).toMatchObject({ id: "APP-002", now: expect.stringMatching(/Withdrawn/) });
    const promoted = r.cards[0].knockOn.find((k) => k.id === "APP-003");
    expect(promoted?.afterPin).toBe("570001");
    expect(decisions(ctx)["APP-003"].status).toMatch(/approved|conditional/);
  });

  it("'APP-012 found a 450 sq ft ground-floor rented shop' saves and the score rises", async () => {
    const ctx = memoryContext(await practiceWs());
    const before = decisions(ctx)["APP-012"].score!;
    const r = await fallbackChat("APP-012 found a 450 sq ft ground-floor rented shop", ctx);
    expect(r.text).toMatch(/Saved/);
    expect(ctx.saved).toBe(true);
    expect(decisions(ctx)["APP-012"].score!).toBeGreaterThan(before);
    expect(r.cards[0].target!.afterScore!).toBeGreaterThan(r.cards[0].target!.beforeScore!);
  });

  it("'Add one opening to TER-03' gives APP-012 an outcome", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("Add one opening to TER-03", ctx);
    expect(r.text).toMatch(/Saved/);
    expect(r.cards[0].knockOn.some((k) => k.id === "APP-012" && /Redirected/.test(k.now))).toBe(true);
  });

  it("asks ONE question for 'found a shop', saves nothing, then saves when answered", async () => {
    const ctx = memoryContext(await practiceWs());
    const first = await fallbackChat("APP-012 found a shop", ctx);
    expect(first.text).toBe("Is the shop owned or rented?");
    expect(ctx.saved).toBe(false);
    expect(first.pending).toEqual({ id: "APP-012", changes: {} });

    const second = await fallbackChat("rented", ctx, first.pending as Pending);
    expect(second.text).toMatch(/size of the space/);
    expect(ctx.saved).toBe(false);
    expect(second.pending).toMatchObject({ id: "APP-012", changes: { space: "Rented" } });

    const third = await fallbackChat("450", ctx, second.pending as Pending);
    expect(third.text).toMatch(/Saved/);
    expect(ctx.saved).toBe(true);
    expect(ctx.ws.applications.find((a) => a.id === "APP-012")).toMatchObject({ space: "Rented", size: 450 });
  });

  it("a floor with no ownership also asks before saving", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("APP-012 found a ground floor shop", ctx);
    expect(r.text).toMatch(/owned or rented/);
    expect(ctx.saved).toBe(false);
  });

  it("compares APP-005 and APP-003 side by side and corrects the premise", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("Why is APP-005 approved at 32 while APP-003 at 87 is waitlisted?", ctx);
    expect(r.text).toMatch(/One correction first/);
    expect(r.text).toMatch(/APP-005 is not approved/);
    expect(r.text).toMatch(/\*\*APP-005 · Not eligible right now\*\*/);
    expect(r.text).toMatch(/\*\*APP-003 · Waiting list\*\*/);
    expect(r.text).toMatch(/held by APP-002/);
    expect(r.text).toMatch(/one store per pin code/);
    expect(ctx.saved).toBe(false);
  });

  it("explains from the stored trail", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("Why is APP-003 on the waiting list?", ctx);
    expect(r.text).toMatch(/Because \(from the stored reason trail\)/);
    expect(r.text).toMatch(/Allocation:/);
    expect(r.text).toMatch(/If APP-002 withdraws/);
  });

  it("declines to approve anyone anyway", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await fallbackChat("approve APP-003 anyway", ctx);
    expect(r.text).toMatch(/can't skip the rules/);
    expect(r.text).toMatch(/Change this decision/);
    expect(ctx.saved).toBe(false);
  });

  it("answers list questions", async () => {
    const ctx = memoryContext(await practiceWs());
    expect((await fallbackChat("Show everyone who needs information", ctx)).text).toMatch(/Needs information: \d+/);
    expect((await fallbackChat("Which areas are full?", ctx)).text).toMatch(/Areas/);
    expect((await fallbackChat("Which five should we start with?", ctx)).text).toMatch(/Start with these/);
  });
});

describe("runChat", () => {
  it("uses the plain parser when the assistant is off", async () => {
    const ctx = memoryContext(await practiceWs());
    const r = await runChat({ message: "APP-002 has withdrawn", ctx, history: [] });
    expect(r.ai).toBe(false);
    expect(r.cards).toHaveLength(1);
  });

  it("runs the tool loop with Google models only, and saves through the tools", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        call += 1;
        const message =
          call === 1
            ? { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "withdraw_application", arguments: JSON.stringify({ id: "APP-002" }) } }] }
            : { role: "assistant", content: "**APP-002 · Withdrawn.** APP-003 now holds pin 570001." };
        return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
      }),
    );
    const ctx = memoryContext(await practiceWs());
    const r = await runChat({ message: "APP-002 has withdrawn", ctx, history: [{ role: "user", content: "hi" }] });
    expect(r.ai).toBe(true);
    expect(r.text).toMatch(/APP-003 now holds pin 570001/);
    expect(ctx.saved).toBe(true);
    expect(r.cards).toHaveLength(1);
    expect(call).toBe(2);
    for (const b of bodies) {
      expect(String(b.model)).toMatch(/^google\//);
      expect(b.provider).toEqual({ only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false });
      expect(b.temperature).toBe(0);
    }
    const second = bodies[1].messages as { role: string; content: string }[];
    expect(second.some((m) => m.role === "tool" && /"saved":true/.test(m.content))).toBe(true);
    const sent = JSON.stringify(bodies);
    expect(sent).not.toMatch(/Lakshmi|Suresh|Anand/);
  });

  it("stops after six steps and falls back instead of looping", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `c${calls}`, type: "function", function: { name: "rerun_engine", arguments: "{}" } }] } }] }), { status: 200 });
      }),
    );
    const ctx = memoryContext(await practiceWs());
    const r = await runChat({ message: "Which areas are full?", ctx, history: [] });
    expect(calls).toBe(6);
    expect(r.ai).toBe(false);
    expect(r.text).toMatch(/Areas/);
  });

  it("falls back when the service errors, without saving twice", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 400 })));
    const ctx = memoryContext(await practiceWs());
    const r = await runChat({ message: "APP-002 has withdrawn", ctx, history: [] });
    expect(r.ai).toBe(false);
    expect(ctx.rev).toBe(2);
  });

  it("reports an earlier save instead of repeating it when the service fails afterwards", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "withdraw_application", arguments: JSON.stringify({ id: "APP-002" }) } }] } }] }), { status: 200 });
        return new Response("no", { status: 400 });
      }),
    );
    const ctx = memoryContext(await practiceWs());
    const r = await runChat({ message: "APP-002 has withdrawn", ctx, history: [] });
    expect(r.text).toMatch(/Saved/);
    expect(ctx.rev).toBe(2);
    expect(r.cards).toHaveLength(1);
  });
});

describe("hints", () => {
  it("returns nothing when the assistant is off, so the keyword reading stands alone", async () => {
    const r = await practice();
    expect(await computeHints(r.applications)).toEqual({});
  });

  it("sends only the free text with no names, and keeps what the assistant returns", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    let sent = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        sent = init.body;
        const content = JSON.stringify({ items: [{ id: "APP-005", business_relevance: "low", claims: [], contradicts_form: [], instruction_attempt: true }, { id: "APP-999", business_relevance: "high", claims: [], contradicts_form: [], instruction_attempt: false }] });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }),
    );
    const r = await practice();
    const hints = await computeHints(r.applications);
    expect(hints["APP-005"]).toMatchObject({ instruction: true, source: "assistant", business: "low" });
    expect(hints["APP-999"]).toBeUndefined();
    expect(sent).toContain("<applicant_text>");
    expect(sent).not.toMatch(/Anand Rao|Lakshmi Gowda/);
  });

  it("never fails the import when the service is slow or broken", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>(() => undefined)));
    const r = await practice();
    expect(await computeHints(r.applications, 50)).toEqual({});
  });
});
