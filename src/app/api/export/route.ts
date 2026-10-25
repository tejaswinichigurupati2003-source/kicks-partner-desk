import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Body = z.object({
  header: z.array(z.string().max(80)).max(30),
  rows: z.array(z.array(z.union([z.string().max(2000), z.number(), z.null()])).max(30)).max(5000),
});

/** Cells starting with = + - @ would run as formulas in Excel, so they are written as plain text. */
function safe(v: string | number | null): string | number {
  if (v === null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export async function POST(req: Request) {
  if (!allow(`export:${clientKey(req)}`, 30, 60_000)) return NextResponse.json({ error: "Please wait a minute and try again." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "We couldn't create the file." }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Decisions");
  ws.addRow(parsed.data.header).font = { bold: true };
  for (const r of parsed.data.rows) ws.addRow(r.map(safe));
  ws.columns = parsed.data.header.map(() => ({ width: 26 }));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kicks-partner-decisions.xlsx"',
    },
  });
}
