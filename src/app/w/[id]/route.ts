import { NextResponse } from "next/server";
import { dbEnabled, workspaceExists } from "@/lib/db";
import { ID_PATTERN, setId } from "@/lib/workspaceId";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens a shared team workspace from its link, then goes to the Overview. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = new URL(req.url);
  const home = (flag: string) => NextResponse.redirect(new URL(`/?${flag}`, base.origin));
  if (!allow(`join:${clientKey(req)}`, 30, 60_000)) return home("workspace=busy");
  if (!dbEnabled() || !ID_PATTERN.test(id)) return home("workspace=missing");
  try {
    if (!(await workspaceExists(id))) return home("workspace=missing");
    await setId(id);
    return home("joined=1");
  } catch {
    return home("workspace=missing");
  }
}
