import { NextResponse } from "next/server";
import { z } from "zod";
import { runChat } from "@/ai/chat";
import { serverContext } from "@/lib/chatContext";
import type { Pending } from "@/engine/assistant";
import { actorOf } from "@/lib/actor";
import { allow, clientKey } from "@/lib/rateLimit";
import { readRunId } from "@/lib/runCookie";
import { addChat, dbEnabled, listChat, loadRun } from "@/lib/runs";
import type { DiffCard } from "@/lib/diffcard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().trim().min(1).max(800) });

/** What is stored with an assistant message: the diff cards, and a question still waiting for an answer. */
interface StoredCards {
  cards?: DiffCard[];
  pending?: Pending | null;
}

export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off", messages: [] });
  const id = await readRunId();
  if (!id) return NextResponse.json({ ok: true, messages: [] });
  try {
    const rows = await listChat(id, 60);
    return NextResponse.json({ ok: true, messages: rows.map((r) => ({ role: r.role, text: r.content, cards: ((r.cards as StoredCards | null)?.cards ?? []) as DiffCard[], at: r.at })) });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused", messages: [] });
  }
}

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off", text: "Saving isn't available right now, so the assistant can't save changes. Please try again in a moment." });
  if (!allow(`chat:${clientKey(req)}`, 120, 60_000)) return NextResponse.json({ ok: false, reason: "busy", text: "Too many questions in a short time. Please wait a minute." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const long = typeof (body as { message?: unknown } | null)?.message === "string" && (body as { message: string }).message.trim().length > 800;
    return NextResponse.json({ ok: false, reason: "invalid", text: long ? "That message is a bit long for me. Please keep it under 800 characters, or split it into two questions." : "Please type a question." }, { status: 400 });
  }
  const runId = await readRunId();
  if (!runId) return NextResponse.json({ ok: true, reply: { text: "There are no applications in this run yet. Import a spreadsheet first, then ask me about any applicant.", cards: [] }, ai: false });
  try {
    const stored = await loadRun(runId);
    if (!stored) return NextResponse.json({ ok: true, reply: { text: "This run has expired. Import a spreadsheet to start a new one.", cards: [] }, ai: false });
    const history = await listChat(runId, 12);
    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
    const pending = ((lastAssistant?.cards as StoredCards | null)?.pending ?? null) as Pending | null;

    const ctx = serverContext(runId, stored.data, stored.rev, actorOf(req));
    const out = await runChat({ message: parsed.data.message, ctx, history: history.map((h) => ({ role: h.role, content: h.content })), pending });
    await addChat(runId, "user", parsed.data.message);
    await addChat(runId, "assistant", out.text, { cards: out.cards, pending: out.pending ?? null } satisfies StoredCards);
    return NextResponse.json({ ok: true, reply: { text: out.text, cards: out.cards }, rev: ctx.rev, saved: ctx.saved, ai: out.ai });
  } catch {
    return NextResponse.json({ ok: false, reason: "failed", text: "Something went wrong. Nothing was lost. Please try again." }, { status: 500 });
  }
}
