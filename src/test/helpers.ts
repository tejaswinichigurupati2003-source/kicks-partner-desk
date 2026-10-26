import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { EXISTING_STORES } from "@/engine/config";
import { run } from "@/engine/run";
import { readWorkbook, type ReadResult } from "@/lib/readWorkbook";
import type { Application, RunInput, Territory } from "@/engine/types";

export async function practice(): Promise<ReadResult> {
  const file = path.resolve(process.cwd(), "public/practice-applications.xlsx");
  const res = await readWorkbook(fs.readFileSync(file), "practice-applications.xlsx");
  if (!res.ok) throw new Error(res.error);
  return res;
}

export async function practiceInput(): Promise<RunInput> {
  const r = await practice();
  return { applications: r.applications, territories: r.territories, stores: r.stores };
}

export const baseApp: Application = {
  id: "APP-100",
  name: "Asha Rao",
  city: "Mysuru",
  state: "Karnataka",
  pin: "570002",
  investment: 30,
  experience: 4,
  business: "Runs a footwear store",
  space: "Rented",
  size: 500,
  floor: "Ground",
  target: 4,
  language: "English",
  notes: "",
};
export const app = (o: Partial<Application>): Application => ({ ...baseApp, ...o });

export const territories: Territory[] = [
  { id: "TER-01", city: "Mysuru", state: "Karnataka", pins: ["570001", "570002", "570008", "570009", "570017"], tier: 2, slots: 2, priority: "High" },
  { id: "TER-02", city: "Mysuru", state: "Karnataka", pins: ["570004", "570005"], tier: 2, slots: 1, priority: "Low" },
  { id: "TER-03", city: "Bengaluru", state: "Karnataka", pins: ["560010", "560011", "560012"], tier: 1, slots: 3, priority: "Medium" },
];

export const input = (applications: Application[], extra: Partial<RunInput> = {}): RunInput => ({ applications, territories, stores: EXISTING_STORES, ...extra });

export const decide = (applications: Application[], extra: Partial<RunInput> = {}) => run(input(applications, extra)).decisions;

/** Builds an in-memory workbook in the import format. */
export async function workbook(opts: { apps: (string | number | null)[][]; territories?: (string | number)[][]; stores?: (string | number)[][]; skipSheet?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  if (opts.skipSheet !== "Applications") {
    const a = wb.addWorksheet("Applications");
    a.addRow(["Applications — one row per record."]);
    a.addRow(["Application ID", "Applicant name", "City", "State", "Pin code", "Investment capacity (₹ lakh)", "Retail experience (years)", "Current / past business", "Space available", "Space size (sq ft)", "Floor", "Target launch (months)", "Preferred language", "Notes from applicant"]);
    for (const r of opts.apps) a.addRow(r);
  }
  const t = wb.addWorksheet("Territories");
  t.addRow(["Territories"]);
  t.addRow(["Territory ID", "City", "State", "Pin codes covered", "City tier", "Open slots", "Priority"]);
  for (const r of opts.territories ?? [["TER-01", "Mysuru", "Karnataka", "570001, 570002, 570008", "Tier 2", 3, "High"]]) t.addRow(r);
  const s = wb.addWorksheet("Existing stores");
  s.addRow(["FIXED"]);
  s.addRow(["Store ID", "City", "Pin code", "Opened (year)"]);
  for (const r of opts.stores ?? [["ST-06", "Mysuru", 570009, 2021]]) s.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
