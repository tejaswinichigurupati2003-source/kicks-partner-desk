import { NextResponse } from "next/server";
import { dbEnabled, listEvents } from "@/lib/runs";
import { readRunId } from "@/lib/runCookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The audit log for this run: imports, chat updates, assumption changes and manual overrides. */
export async function GET(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off", events: [] });
  const id = await readRunId();
  if (!id) return NextResponse.json({ ok: true, events: [] });
  const url = new URL(req.url);
  const application = url.searchParams.get("application");
  const limit = Number(url.searchParams.get("limit") ?? "200");
  try {
    const events = await listEvents(id, { applicationId: application && /^[\w .-]{1,40}$/.test(application) ? application : null, limit: Number.isFinite(limit) ? limit : 200 });
    return NextResponse.json({ ok: true, events });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused", events: [] });
  }
}
