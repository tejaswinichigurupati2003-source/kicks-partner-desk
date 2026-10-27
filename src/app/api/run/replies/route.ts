import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, clientKey } from "@/lib/rateLimit";
import { readRunId } from "@/lib/runCookie";
import { dbEnabled, listReplies, markReplyHandled } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Applicants' answers waiting for the team, for this run. */
export async function GET(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, replies: [] });
  if (!allow(`replies:${clientKey(req)}`, 120, 60_000)) return NextResponse.json({ ok: false, replies: [] }, { status: 429 });
  const id = await readRunId();
  if (!id) return NextResponse.json({ ok: true, replies: [] });
  try {
    const applicationId = new URL(req.url).searchParams.get("application") ?? undefined;
    return NextResponse.json({ ok: true, replies: await listReplies(id, { applicationId: applicationId && /^[\w-]{1,40}$/.test(applicationId) ? applicationId : undefined }) });
  } catch {
    return NextResponse.json({ ok: false, replies: [] });
  }
}

const Handle = z.object({ id: z.number().int().positive() });

export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false });
  const parsed = Handle.safeParse(await req.json().catch(() => null));
  const runId = await readRunId();
  if (!parsed.success || !runId) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    return NextResponse.json({ ok: await markReplyHandled(runId, parsed.data.id) });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
