import { diff, type DiffRow } from "@/engine/rerun";
import type { RunResult } from "@/engine/types";

export type Trigger = "import" | "chat" | "assumption" | "override" | "edit" | "undo" | "stage" | "territory" | "note";

export interface CardLine {
  id: string;
  name: string;
  was: string;
  now: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforePin: string | null;
  afterPin: string | null;
  rankBefore: number | null;
  rankAfter: number | null;
  conditionsBefore: string[];
  conditionsAfter: string[];
  why: string;
}

/** What the team sees after a change: the target, then everyone else it moved. */
export interface DiffCard {
  groupId: string | null;
  trigger: Trigger;
  summary: string;
  target: CardLine | null;
  knockOn: CardLine[];
  undoable: boolean;
  undone?: boolean;
}

function line(r: DiffRow): CardLine {
  return {
    id: r.id,
    name: r.name,
    was: r.was,
    now: r.now,
    beforeScore: r.beforeScore,
    afterScore: r.afterScore,
    beforePin: r.beforePin,
    afterPin: r.afterPin,
    rankBefore: r.before?.rank ?? null,
    rankAfter: r.after.rank,
    conditionsBefore: r.before?.condition.map((c) => c.text) ?? [],
    conditionsAfter: r.after.condition.map((c) => c.text),
    why: r.why,
  };
}

export function buildDiffCard(before: RunResult, after: RunResult, names: Record<string, string>, targetId: string | null, meta: { trigger: Trigger; summary: string; groupId: string | null; undoable: boolean }): DiffCard {
  const rows = diff(before, after, names, targetId ?? undefined);
  let target: CardLine | null = null;
  if (targetId) {
    const t = rows.find((r) => r.id === targetId);
    if (t) target = line(t);
    else if (after.decisions[targetId]) {
      // The target's own status did not move, but its score or details may have.
      const b = before.decisions[targetId];
      const a = after.decisions[targetId];
      target = {
        id: targetId, name: names[targetId] ?? targetId, was: b ? `${b.verdict}` : "New", now: a.verdict,
        beforeScore: b?.score ?? null, afterScore: a.score, beforePin: b?.assignedPin ?? null, afterPin: a.assignedPin,
        rankBefore: b?.rank ?? null, rankAfter: a.rank, conditionsBefore: b?.condition.map((c) => c.text) ?? [],
        conditionsAfter: a.condition.map((c) => c.text), why: "No change in status or pin.",
      };
    }
  }
  const knockOn = rows.filter((r) => r.id !== targetId).map(line);
  return { groupId: meta.groupId, trigger: meta.trigger, summary: meta.summary, target, knockOn, undoable: meta.undoable };
}
