import { NextResponse } from "next/server";
import { dbEnabled, purgeOld } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily clean-up: deletes runs with no changes for 7 days. Vercel calls this with the CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ ok: true, deleted: 0 });
  try {
    return NextResponse.json({ ok: true, deleted: await purgeOld() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
