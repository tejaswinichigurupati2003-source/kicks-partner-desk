import ExcelJS from "exceljs";
import { EXISTING_STORES } from "@/engine/config";

export const runtime = "nodejs";

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet, title: string, cols: string[]) => {
    ws.addRow([title]).font = { bold: true };
    const h = ws.addRow(cols);
    h.font = { bold: true };
    h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4FF3A" } }));
    ws.columns = cols.map(() => ({ width: 22 }));
  };
  const apps = wb.addWorksheet("Applications");
  head(apps, "Applications: one row per applicant. Enter data from row 3.", [
    "Application ID", "Applicant name", "City", "State", "Pin code", "Investment capacity (₹ lakh)", "Retail experience (years)",
    "Current / past business", "Space available", "Space size (sq ft)", "Floor", "Target launch (months)", "Preferred language", "Notes from applicant",
  ]);
  const ter = wb.addWorksheet("Territories");
  head(ter, "Territories: one row per area. Enter data from row 3.", ["Territory ID", "City", "State", "Pin codes covered", "City tier", "Open slots", "Priority"]);
  const st = wb.addWorksheet("Existing stores");
  head(st, "Existing stores: all Kicks stores open today.", ["Store ID", "City", "Pin code", "Opened (year)"]);
  for (const s of EXISTING_STORES) st.addRow([s.id, s.city, Number(s.pin), s.year]);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kicks-partner-desk-template.xlsx"',
    },
  });
}
