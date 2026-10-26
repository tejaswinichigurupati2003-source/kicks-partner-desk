import { NextResponse } from "next/server";
import { z } from "zod";
import { dbEnabled, undoGroup } from "@/lib/runs";
import { readRunId } from "@/lib/runCookie";
import { actorOf } from "@/lib/actor";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ groupId: z.string().uuid() });

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  if (!allow(`undo:${clientKey(req)}`, 30, 60_000)) return NextResponse.json({ ok: false, reason: "busy" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const id = await readRunId();
  if (!id) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  try {
    const res = await undoGroup(id, parsed.data.groupId, actorOf(req));
    return NextResponse.json(res, { status: res.ok ? 200 : res.reason === "not_found" ? 404 : 409 });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}
