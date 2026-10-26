import { NextResponse } from "next/server";
import { dbEnabled, listRuns } from "@/lib/runs";
import { readRunId } from "@/lib/runCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The runs the team has going, and which one this browser is in. */
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  try {
    const [runs, current] = await Promise.all([listRuns(), readRunId()]);
    return NextResponse.json({ ok: true, runs, current });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}
