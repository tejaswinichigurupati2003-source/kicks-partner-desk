import { NextResponse } from "next/server";
import { dbEnabled, loadWorkspace, saveWorkspace, purgeOld } from "@/lib/db";
import { allow, clientKey } from "@/lib/rateLimit";
import { newId, readId, setId } from "@/lib/workspaceId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A workspace belongs to whoever holds its link. A new visitor gets a new private workspace;
 * sharing the link lets a team work in the same one.
 */
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  try {
    const id = await readId();
    if (!id) return NextResponse.json({ ok: true, id: null, data: null, rev: 0 });
    const stored = await loadWorkspace(id);
    return NextResponse.json({ ok: true, id, data: stored?.data ?? null, rev: stored?.rev ?? 0 });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  if (!allow(`ws:${clientKey(req)}`, 120, 60_000)) return NextResponse.json({ ok: false, reason: "busy" }, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, reason: "large" }, { status: 413 });
  let body: { data?: unknown; rev?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const data = body.data as { v?: unknown } | undefined;
  const rev = typeof body.rev === "number" && Number.isInteger(body.rev) && body.rev >= 0 ? body.rev : 0;
  if (typeof data !== "object" || data === null || data.v !== 1) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    let id = await readId();
    if (!id) {
      id = newId();
      await setId(id);
    }
    const result = await saveWorkspace(id, data, rev);
    if (!result.ok) return NextResponse.json({ ok: false, reason: "conflict", data: result.conflict.data, rev: result.conflict.rev, id }, { status: 409 });
    if (Math.random() < 0.02) void purgeOld();
    return NextResponse.json({ ok: true, id, rev: result.rev });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}

/** Starts a fresh private workspace in this browser. */
export async function DELETE() {
  await setId(newId());
  return NextResponse.json({ ok: true });
}
