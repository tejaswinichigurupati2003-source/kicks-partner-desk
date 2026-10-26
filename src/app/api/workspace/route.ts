import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { dbEnabled, loadWorkspace, saveWorkspace, purgeOld } from "@/lib/db";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "kicks_workspace";
const MAX_BYTES = 4 * 1024 * 1024;

async function workspaceId(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{32,64}$/.test(existing)) return existing;
  if (!create) return null;
  const id = randomBytes(24).toString("base64url");
  jar.set(COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
  return id;
}

/** Each browser gets a private workspace. Nobody can read another one. */
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  try {
    const id = await workspaceId(false);
    if (!id) return NextResponse.json({ ok: true, data: null });
    return NextResponse.json({ ok: true, data: await loadWorkspace(id) });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  if (!allow(`ws:${clientKey(req)}`, 60, 60_000)) return NextResponse.json({ ok: false, reason: "busy" }, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, reason: "large" }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof data !== "object" || data === null || (data as { v?: unknown }).v !== 1) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const id = await workspaceId(true);
    await saveWorkspace(id as string, data);
    if (Math.random() < 0.02) void purgeOld();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}
