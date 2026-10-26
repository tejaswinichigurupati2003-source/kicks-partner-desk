import { NextResponse } from "next/server";
import { z } from "zod";
import { executeTool } from "@/ai/tools";
import { actorOf } from "@/lib/actor";
import { serverContext } from "@/lib/chatContext";
import { allow, clientKey } from "@/lib/rateLimit";
import { readRunId } from "@/lib/runCookie";
import { addChat, dbEnabled, loadRun } from "@/lib/runs";
import { oneLineReply } from "@/lib/diffcard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOLS = ["update_application", "withdraw_application", "update_territory", "set_assumption"] as const;
const Body = z.object({ tool: z.enum(TOOLS), args: z.record(z.string(), z.unknown()) });

/** Saves a change the person previewed. The same tool runs again on the latest data, so the saved result is always what the rules say now. */
export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, text: "Saving isn't available right now." });
  if (!allow(`apply:${clientKey(req)}`, 60, 60_000)) return NextResponse.json({ ok: false, text: "Too many changes in a short time. Please wait a minute." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, text: "That change can't be applied." }, { status: 400 });
  const runId = await readRunId();
  if (!runId) return NextResponse.json({ ok: false, text: "There is no run to change." });
  try {
    const stored = await loadRun(runId);
    if (!stored) return NextResponse.json({ ok: false, text: "This run has expired." });
    const ctx = serverContext(runId, stored.data, stored.rev, actorOf(req));
    const out = (await executeTool(ctx, parsed.data.tool, { ...parsed.data.args, mode: "apply" })) as { error?: string; message?: string; needs_clarification?: string };
    const card = ctx.cards[ctx.cards.length - 1] ?? null;
    if (!ctx.saved || !card) return NextResponse.json({ ok: false, text: out.message ?? out.needs_clarification ?? "Nothing was saved." });
    const text = oneLineReply(card);
    await addChat(runId, "assistant", `Applied the previewed change. ${text}`, { cards: [card], pending: null });
    return NextResponse.json({ ok: true, card, text });
  } catch {
    return NextResponse.json({ ok: false, text: "Something went wrong. Nothing was saved." }, { status: 500 });
  }
}
