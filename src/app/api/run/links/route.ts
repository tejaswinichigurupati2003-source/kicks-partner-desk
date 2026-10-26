import { NextResponse } from "next/server";
import { dbEnabled, loadRun, statusTokens } from "@/lib/runs";
import { readRunId } from "@/lib/runCookie";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A short private status link for every applicant in this run, for example /s/Ab3x9K. */
export async function GET(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off", links: {} });
  if (!allow(`links:${clientKey(req)}`, 60, 60_000)) return NextResponse.json({ ok: false, reason: "busy", links: {} }, { status: 429 });
  const id = await readRunId();
  if (!id) return NextResponse.json({ ok: true, links: {} });
  try {
    const run = await loadRun(id);
    if (!run) return NextResponse.json({ ok: true, links: {} });
    const tokens = await statusTokens(id, run.data.applications.map((a) => a.id));
    const origin = new URL(req.url).origin;
    return NextResponse.json({ ok: true, links: Object.fromEntries(Object.entries(tokens).map(([appId, t]) => [appId, `${origin}/s/${t}`])) });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused", links: {} });
  }
}
