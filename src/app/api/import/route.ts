import { NextResponse } from "next/server";
import { readWorkbook } from "@/lib/readWorkbook";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!allow(`import:${clientKey(req)}`, 20, 60_000))
    return NextResponse.json({ ok: false, error: "That's a lot of uploads in a short time. Please wait a minute and try again." }, { status: 429 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "We didn't receive a file. Please choose an Excel file and try again." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "We didn't receive a file. Please choose an Excel file and try again." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "This file is larger than 5 MB. Please remove extra rows or sheets and try again." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await readWorkbook(buffer, file.name);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
