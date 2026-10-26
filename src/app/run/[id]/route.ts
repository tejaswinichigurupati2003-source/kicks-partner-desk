import { NextResponse } from "next/server";
import { dbEnabled, runExists } from "@/lib/runs";
import { RUN_ID, setRunId } from "@/lib/runCookie";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens a run from its link. No sign-in: the link itself is the key. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = new URL(req.url).origin;
  const home = (flag: string) => NextResponse.redirect(new URL(`/?${flag}`, origin));
  if (!allow(`join:${clientKey(req)}`, 30, 60_000)) return home("run=busy");
  if (!dbEnabled() || !RUN_ID.test(id)) return home("run=missing");
  try {
    if (!(await runExists(id))) return home("run=missing");
    await setRunId(id);
    return home("joined=1");
  } catch {
    return home("run=missing");
  }
}
