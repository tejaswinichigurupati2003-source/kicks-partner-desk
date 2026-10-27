import { NextResponse } from "next/server";
import { z } from "zod";
import { run } from "@/engine/run";
import { allow, clientKey } from "@/lib/rateLimit";
import { addReply, dbEnabled, loadRun, resolveToken } from "@/lib/runs";
import { toRunInput } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().regex(/^[A-Za-z0-9]{4,12}$/), text: z.string().trim().min(2).max(600) });
const REPLY_STATUSES = ["needs_info", "conditional", "redirected"];

/**
 * An applicant answers from their status page. The answer is saved for the team to read.
 * It never changes the decision: applicant text is information, and a person confirms any change.
 */
export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, error: "Replies are not available right now. Please try again later." }, { status: 503 });
  if (!allow(`reply:${clientKey(req)}`, 6, 60_000)) return NextResponse.json({ ok: false, error: "Too many messages in a short time. Please wait a minute and try again." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Please write your answer, up to 600 characters." }, { status: 400 });
  try {
    const found = await resolveToken(parsed.data.token);
    if (!found) return NextResponse.json({ ok: false, error: "This link is not valid or has expired." }, { status: 404 });
    const stored = await loadRun(found.runId);
    const d = stored ? run(toRunInput(stored.data)).decisions[found.applicationId] : null;
    if (!stored || !d) return NextResponse.json({ ok: false, error: "This link is not valid or has expired." }, { status: 404 });
    if (!REPLY_STATUSES.includes(d.status)) return NextResponse.json({ ok: false, error: "There is nothing to answer on this application right now." }, { status: 409 });
    // eslint-disable-next-line no-control-regex
    const clean = parsed.data.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const saved = await addReply(found.runId, found.applicationId, clean, d.ask ?? d.nextStep ?? null);
    if (!saved) return NextResponse.json({ ok: false, error: "We already have several messages from you waiting for our team. Please wait for a reply." }, { status: 429 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
