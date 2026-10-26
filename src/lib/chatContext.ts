import "server-only";
import type { PersistMeta, ToolContext } from "@/ai/tools";
import type { Workspace } from "./workspace";
import { saveRun } from "./runs";

/** The tool context for one run on the server: every change goes through the normal save path. */
export function serverContext(runId: string, ws: Workspace, rev: number, actor: string): ToolContext {
  const ctx: ToolContext = {
    ws,
    rev,
    actor,
    cards: [],
    saved: false,
    persist: async (next, meta: PersistMeta) => {
      const res = await saveRun(runId, next, ctx.rev, meta);
      return res.ok ? { ok: true, rev: res.rev, card: res.card } : { ok: false, conflict: true };
    },
  };
  return ctx;
}
