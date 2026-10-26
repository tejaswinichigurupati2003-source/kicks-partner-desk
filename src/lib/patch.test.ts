import { describe, expect, it } from "vitest";
import { run } from "@/engine/run";
import { applyChange } from "@/engine/rerun";
import { applyPatch, assumptionDelta, makePatch } from "./patch";
import { buildDiffCard } from "./diffcard";
import { emptyWorkspace, normaliseWorkspace, toRunInput } from "./workspace";
import { practice } from "../test/helpers";

async function start() {
  const r = await practice();
  return { ...emptyWorkspace(), fileName: "practice-applications.xlsx", applications: r.applications, territories: r.territories, stores: r.stores };
}

describe("undo patches", () => {
  it("undoing a withdrawal restores the earlier decisions exactly", async () => {
    const before = await start();
    const after = { ...before, applications: before.applications.map((a) => (a.id === "APP-002" ? applyChange(a, { withdrawn: true }) : a)) };
    const patch = makePatch(before, after);
    expect(Object.keys(patch!.applications!)).toEqual(["APP-002"]);
    const restored = applyPatch(after, patch!);
    expect(JSON.stringify(run(toRunInput(restored)).decisions)).toBe(JSON.stringify(run(toRunInput(before)).decisions));
  });
  it("undoes an added opening and a changed assumption", async () => {
    const before = await start();
    const after = { ...before, territories: before.territories.map((t) => (t.id === "TER-03" ? { ...t, slots: t.slots + 1 } : t)), assumptions: { minScoreToAllocate: 20 } };
    const patch = makePatch(before, after)!;
    expect(patch.territories!["TER-03"]!.slots).toBe(1);
    const restored = applyPatch(after, patch);
    expect(restored.territories.find((t) => t.id === "TER-03")!.slots).toBe(1);
    expect(restored.assumptions).toEqual({});
  });
  it("puts a removed applicant back, and removes an added one", async () => {
    const before = await start();
    const removed = { ...before, applications: before.applications.filter((a) => a.id !== "APP-005") };
    expect(applyPatch(removed, makePatch(before, removed)!).applications.some((a) => a.id === "APP-005")).toBe(true);
    const extra = { ...before, applications: [...before.applications, { ...before.applications[0], id: "APP-900" }] };
    expect(applyPatch(extra, makePatch(before, extra)!).applications.some((a) => a.id === "APP-900")).toBe(false);
  });
  it("no patch when nothing decision-relevant changed", async () => {
    const before = await start();
    expect(makePatch(before, { ...before, stages: { "APP-002": { agreement: "Done" } } })).toBeNull();
  });
  it("reports which assumptions changed, old and new", () => {
    const d = assumptionDelta({}, { minScoreToAllocate: 50, investmentTolerancePct: 15 });
    expect(d.before).toEqual({ minScoreToAllocate: 45, investmentTolerancePct: 10 });
    expect(d.after).toEqual({ minScoreToAllocate: 50, investmentTolerancePct: 15 });
  });
});

describe("diff card", () => {
  it("withdrawing APP-002 shows the target first and APP-003 as a knock-on, with pin and status before and after", async () => {
    const before = await start();
    const after = { ...before, applications: before.applications.map((a) => (a.id === "APP-002" ? applyChange(a, { withdrawn: true }) : a)) };
    const names = Object.fromEntries(before.applications.map((a) => [a.id, a.name]));
    const card = buildDiffCard(run(toRunInput(before)), run(toRunInput(after)), names, "APP-002", { trigger: "chat", summary: "APP-002 withdrew.", groupId: "g", undoable: true });
    expect(card.target?.id).toBe("APP-002");
    expect(card.target?.now).toBe("Withdrawn");
    expect(card.target?.beforePin).toBe("570001");
    const three = card.knockOn.find((l) => l.id === "APP-003")!;
    expect(three.afterPin).toBe("570001");
    expect(three.was).toMatch(/Waiting list/);
    expect(three.now).toMatch(/Approved/);
    expect(card.undoable).toBe(true);
  });
  it("normalises an older saved run", () => {
    const w = normaliseWorkspace({ applications: [], territories: [] } as never);
    expect(w.stores).toHaveLength(10);
    expect(w.assumptions).toEqual({});
  });
});
