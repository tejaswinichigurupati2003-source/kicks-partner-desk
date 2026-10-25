import { NextResponse } from "next/server";
import { z } from "zod";
import { SnapshotSchema, signSnapshot } from "@/lib/token";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({ items: z.array(SnapshotSchema).max(2000) });

export async function POST(req: Request) {
  if (!allow(`links:${clientKey(req)}`, 60, 60_000)) return NextResponse.json({ error: "Please wait a minute and try again." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "We couldn't create the links." }, { status: 400 });
  const tokens: Record<string, string> = {};
  for (const s of parsed.data.items) tokens[s.id] = signSnapshot(s);
  return NextResponse.json({ tokens });
}
