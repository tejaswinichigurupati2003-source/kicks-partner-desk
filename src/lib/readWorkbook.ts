import ExcelJS from "exceljs";
import { CONFIG, EXISTING_STORES } from "@/engine/config";
import { cleanApplication, cleanStore, cleanTerritory, isTemplateExample, type Cell, type RawRow } from "@/engine/normalise";
import type { Application, Store, Territory } from "@/engine/types";

export interface FileReport {
  applicationRows: number;
  territoryRows: number;
  storeRows: number;
  messages: string[];
}

export interface ReadResult {
  ok: true;
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  report: FileReport;
}
export interface ReadError {
  ok: false;
  error: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return plain(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
  }
  return null;
}

function sheetRows(ws: ExcelJS.Worksheet, marker: string): RawRow[] | null {
  let headerRow = -1;
  const limit = Math.min(ws.rowCount, 30);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    let hit = false;
    row.eachCell((cell) => {
      const v = plain(cell.value);
      if (typeof v === "string" && v.trim().toLowerCase() === marker.toLowerCase()) hit = true;
    });
    if (hit) {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return null;
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(plain(cell.value) ?? "").trim();
  });
  const rows: RawRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: RawRow = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = plain(row.getCell(col).value);
      if (v !== null && String(v).trim() !== "") any = true;
      obj[h] = v;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
}

export async function readWorkbook(buffer: Buffer, fileName: string): Promise<ReadResult | ReadError> {
  if (!/\.xlsx$/i.test(fileName)) return { ok: false, error: "Please upload an Excel file that ends in .xlsx." };
  if (buffer.length > MAX_BYTES) return { ok: false, error: "This file is larger than 5 MB. Please remove extra rows or sheets and try again." };
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04)
    return { ok: false, error: "This doesn't look like an Excel (.xlsx) file. Please save it as .xlsx from Excel or Google Sheets and try again." };
  const probe = buffer.toString("latin1");
  if (probe.includes("vbaProject.bin")) return { ok: false, error: "This file contains macros, so we can't open it. Please save a copy without macros (.xlsx)." };
  if (probe.includes("externalLinks/")) return { ok: false, error: "This file links to other files, so we can't open it. Please paste the values into a new .xlsx file." };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "We couldn't read this file. Please check that it opens in Excel, then try again." };
  }

  const appSheet = findSheet(wb, "Applications");
  const terSheet = findSheet(wb, "Territories");
  const storeSheet = findSheet(wb, "Existing stores");
  const missing = [!appSheet && "Applications", !terSheet && "Territories"].filter(Boolean) as string[];
  if (missing.length) return { ok: false, error: `The sheet ${missing.join(" and ")} is missing. The file needs sheets named Applications, Territories and Existing stores.` };

  const messages: string[] = [];
  const appRaw = sheetRows(appSheet!, "Application ID");
  if (!appRaw) return { ok: false, error: 'We couldn\'t find the heading "Application ID" on the Applications sheet.' };
  const terRaw = sheetRows(terSheet!, "Territory ID");
  if (!terRaw) return { ok: false, error: 'We couldn\'t find the heading "Territory ID" on the Territories sheet.' };
  if (appRaw.length > CONFIG.maxRows) return { ok: false, error: `The Applications sheet has more than ${CONFIG.maxRows} rows. Please split it into smaller files.` };

  const applications: Application[] = [];
  const seen = new Set<string>();
  let skippedExample = 0;
  for (const raw of appRaw) {
    const a = cleanApplication(raw);
    if (isTemplateExample(a)) {
      skippedExample++;
      continue;
    }
    if (!a.id) {
      messages.push("A row without an Application ID was skipped.");
      continue;
    }
    if (seen.has(a.id)) {
      messages.push(`${a.id} appears more than once. The first one was kept and the later one was skipped.`);
      continue;
    }
    seen.add(a.id);
    applications.push(a);
  }
  if (skippedExample) messages.push("The example row from the template was skipped.");

  const territories: Territory[] = [];
  const tSeen = new Set<string>();
  for (const raw of terRaw) {
    const t = cleanTerritory(raw);
    if (!t.id) continue;
    if (tSeen.has(t.id)) {
      messages.push(`${t.id} appears more than once. The first one was kept.`);
      continue;
    }
    tSeen.add(t.id);
    territories.push(t);
  }
  const pinOwner = new Map<string, string>();
  for (const t of territories)
    for (const p of t.pins) {
      const owner = pinOwner.get(p);
      if (owner && owner !== t.id) messages.push(`Pin code ${p} is listed in both ${owner} and ${t.id}. ${owner} is used.`);
      else pinOwner.set(p, t.id);
    }

  let stores: Store[] = [];
  if (storeSheet) {
    const storeRaw = sheetRows(storeSheet, "Store ID");
    if (storeRaw) stores = storeRaw.map(cleanStore).filter((s) => s.id && /^\d{6}$/.test(s.pin));
  }
  if (stores.length === 0) {
    stores = EXISTING_STORES;
    messages.push("No existing stores were found in the file, so our current list of 10 stores was used.");
  }

  if (applications.length === 0) messages.push("No applications were found below the headings.");
  if (territories.length === 0) messages.push("No areas were found on the Territories sheet.");
  return {
    ok: true,
    applications,
    territories,
    stores,
    report: { applicationRows: applications.length, territoryRows: territories.length, storeRows: stores.length, messages },
  };
}
