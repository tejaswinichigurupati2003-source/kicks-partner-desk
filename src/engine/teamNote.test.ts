import { describe, expect, it } from "vitest";
import { buildMessage, TEAM_NOTE_MAX } from "./messages";
import { run } from "./run";
import { makePatch, applyPatch } from "@/lib/patch";
import { emptyWorkspace } from "@/lib/workspace";
import { app, input } from "@/test/helpers";

const facts = { now: new Date("2026-10-26"), link: "https://x/s/abc123" };
const decision = (a: ReturnType<typeof app>) => run(input([a])).decisions[a.id];

describe("evaluator's note", () => {
  it("is added to the message in every language and leaves the decision alone", () => {
    const plain = app({ id: "APP-900" });
    const noted = { ...plain, teamNote: "Please call after 5 pm." };
    expect(decision(noted).status).toBe(decision(plain).status);
    expect(decision(noted).score).toBe(decision(plain).score);
    for (const lang of ["English", "Kannada", "Hindi"] as const) {
      const m = buildMessage(noted, decision(noted), lang, facts);
      expect(m).toContain("Please call after 5 pm.");
      expect(buildMessage(plain, decision(plain), lang, facts)).not.toContain("5 pm");
    }
  });

  it("collapses whitespace, ignores blanks and caps the length", () => {
    const base = app({ id: "APP-901" });
    expect(buildMessage({ ...base, teamNote: "   " }, decision(base), "English", facts)).toBe(buildMessage(base, decision(base), "English", facts));
    const long = buildMessage({ ...base, teamNote: "a ".repeat(500) }, decision(base), "English", facts);
    const std = buildMessage(base, decision(base), "English", facts);
    expect(long.length - std.length).toBeLessThanOrEqual(TEAM_NOTE_MAX + 40);
  });

  it("can be undone from the saved patch", () => {
    const a = app({ id: "APP-902" });
    const before = { ...emptyWorkspace(), applications: [a] };
    const after = { ...before, applications: [{ ...a, teamNote: "Hello" }] };
    const patch = makePatch(before, after)!;
    expect(applyPatch(after, patch).applications[0].teamNote).toBeUndefined();
  });
});
