import ExcelJS from "exceljs";
import { CONFIG, EXISTING_STORES } from "@/engine/config";
import { cleanApplication, cleanStore, cleanTerritory, isTemplateExample, type Cell, type RawRow } from "@/engine/normalise";
import type { Application, Store, Territory } from "@/engine/types";
import type { DataHealth } from "./workspace";

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
  health: DataHealth;
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

interface SheetRead {
  headers: string[];
  headerRow: number;
  rows: { row: number; raw: RawRow }[];
}

function sheetRows(ws: ExcelJS.Worksheet, marker: string): SheetRead | null {
  let headerRow = -1;
  const limit = Math.min(ws.rowCount, 30);
  for (let r = 1; r <= limit; r++) {
    let hit = false;
    ws.getRow(r).eachCell((cell) => {
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
  const rows: SheetRead["rows"] = [];
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
    if (any) rows.push({ row: r, raw: obj });
  }
  return { headers, headerRow, rows };
}

function isTemplateTerritory(t: Territory): boolean {
  return t.id === "TER-01" && t.city === "Mysuru" && t.pins.join(",") === "570001,570002,570008" && t.slots === 3 && t.priority === "High";
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

  const appRead = sheetRows(appSheet!, "Application ID");
  if (!appRead) return { ok: false, error: 'We couldn\'t find the heading "Application ID" on the Applications sheet.' };
  const terRead = sheetRows(terSheet!, "Territory ID");
  if (!terRead) return { ok: false, error: 'We couldn\'t find the heading "Territory ID" on the Territories sheet.' };
  if (appRead.rows.length > CONFIG.maxRows) return { ok: false, error: `The Applications sheet has more than ${CONFIG.maxRows} rows. Please split it into smaller files.` };

  const errors: DataHealth["errors"] = [];
  const changes: DataHealth["changes"] = [];
  const messages: string[] = [];

  const applications: Application[] = [];
  const seen = new Map<string, number>();
  let exampleRow: number | null = null;
  for (const { row, raw } of appRead.rows) {
    const a = cleanApplication(raw, row);
    if (isTemplateExample(a)) {
      exampleRow = row;
      continue;
    }
    if (!a.id) {
      errors.push({ sheet: "Applications", row, text: "No Application ID, so the row was skipped." });
      continue;
    }
    if (seen.has(a.id)) {
      errors.push({ sheet: "Applications", row, text: `${a.id} already appears in row ${seen.get(a.id)}. The first one was kept and this row was skipped.` });
      continue;
    }
    seen.set(a.id, row);
    if (a.investmentProblem && a.investmentProblem !== "blank") errors.push({ sheet: "Applications", row, text: `${a.id}: investment is ${a.investmentProblem}.` });
    if (a.experienceProblem && a.experienceProblem !== "blank") errors.push({ sheet: "Applications", row, text: `${a.id}: retail experience is ${a.experienceProblem}.` });
    if (a.pin && !/^\d{6}$/.test(a.pin)) errors.push({ sheet: "Applications", row, text: `${a.id}: pin code "${a.pin}" is not 6 digits.` });
    if (a.space === null && String(raw["Space available"] ?? "").trim() !== "") errors.push({ sheet: "Applications", row, text: `${a.id}: space "${String(raw["Space available"])}" is not Owned, Rented or Not yet identified.` });
    if (a.floor === null && String(raw["Floor"] ?? "").trim() !== "") errors.push({ sheet: "Applications", row, text: `${a.id}: floor "${String(raw["Floor"])}" is not Ground, Upper, Mall unit or Not known.` });
    for (const c of a.cleaned ?? []) changes.push({ row, id: a.id, text: c });
    applications.push(a);
  }

  // Blank answers per column, counted on the rows that were kept.
  const kept = new Set(applications.map((a) => a.row));
  const blanks = appRead.headers
    .filter(Boolean)
    .map((h) => ({ column: h, count: appRead.rows.filter((r) => kept.has(r.row) && String(r.raw[h] ?? "").trim() === "").length }))
    .filter((b) => b.count > 0);

  const territories: Territory[] = [];
  const tSeen = new Set<string>();
  const pinOwner = new Map<string, string>();
  for (const { row, raw } of terRead.rows) {
    const t = cleanTerritory(raw);
    if (!t.id) {
      errors.push({ sheet: "Territories", row, text: "No Territory ID, so the row was skipped." });
      continue;
    }
    if (tSeen.has(t.id)) {
      // The template's own example row can be left in place with the real TER-01 below it: the real one wins.
      const first = territories.findIndex((x) => x.id === t.id);
      if (first >= 0 && isTemplateTerritory(territories[first])) {
        territories.splice(first, 1);
        errors.push({ sheet: "Territories", row, text: `The template's example row for ${t.id} was replaced by this row.` });
      } else {
        errors.push({ sheet: "Territories", row, text: `${t.id} appears more than once. The first one was kept.` });
        continue;
      }
    }
    tSeen.add(t.id);
    for (const p of t.pins) {
      if (!/^\d{6}$/.test(p)) errors.push({ sheet: "Territories", row, text: `${t.id}: pin code "${p}" is not 6 digits.` });
      const owner = pinOwner.get(p);
      if (owner && owner !== t.id) errors.push({ sheet: "Territories", row, text: `Pin code ${p} is listed in both ${owner} and ${t.id}. ${owner} is used.` });
      else pinOwner.set(p, t.id);
    }
    if (String(raw["Open slots"] ?? "").trim() !== "" && !/^\d+$/.test(String(raw["Open slots"]).trim())) errors.push({ sheet: "Territories", row, text: `${t.id}: open slots "${String(raw["Open slots"])}" was read as ${t.slots}.` });
    territories.push(t);
  }

  let stores: Store[] = [];
  if (storeSheet) {
    const storeRead = sheetRows(storeSheet, "Store ID");
    if (storeRead) {
      for (const { row, raw } of storeRead.rows) {
        const s = cleanStore(raw);
        if (!s.id || !/^\d{6}$/.test(s.pin)) {
          errors.push({ sheet: "Existing stores", row, text: `${s.id || "A store"}: pin code "${s.pin}" is not 6 digits, so the row was skipped.` });
          continue;
        }
        stores.push(s);
      }
    }
  }
  if (stores.length === 0) {
    stores = EXISTING_STORES;
    messages.push("No existing stores were found in the file, so our current list of 10 stores was used.");
  }
  if (applications.length === 0) messages.push("No applications were found below the headings.");
  if (territories.length === 0) messages.push("No areas were found on the Territories sheet.");
  if (exampleRow !== null) messages.push(`The template's example row (row ${exampleRow}) was skipped.`);
  for (const e of errors) messages.push(`${e.sheet}, row ${e.row}: ${e.text}`);

  const health: DataHealth = {
    sheets: [
      { name: "Applications", found: true, rows: applications.length },
      { name: "Territories", found: true, rows: territories.length },
      { name: "Existing stores", found: !!storeSheet, rows: stores.length },
    ],
    applicationRows: applications.length,
    territoryRows: territories.length,
    storeRows: stores.length,
    exampleRowSkipped: exampleRow !== null,
    exampleRow,
    blanks,
    changes,
    errors,
  };
  return {
    ok: true,
    applications,
    territories,
    stores,
    report: { applicationRows: applications.length, territoryRows: territories.length, storeRows: stores.length, messages },
    health,
  };
}
