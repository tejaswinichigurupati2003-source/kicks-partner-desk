import { NextResponse } from "next/server";
import { dbEnabled, ping } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const saving = dbEnabled() ? ((await ping()) ? "on" : "paused") : "off";
  return NextResponse.json({ ok: true, service: "Kicks Partner Desk", saving, time: new Date().toISOString() });
}
