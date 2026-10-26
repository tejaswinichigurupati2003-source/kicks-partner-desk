import { describe, expect, it } from "vitest";
import { readWorkbook, type ReadResult } from "./readWorkbook";
import { workbook } from "../test/helpers";

const EXAMPLE = ["APP-001", "Ravi Kumar", "Mysuru", "Karnataka", 570001, 25, 4, "Runs a footwear store", "Rented", 450, "Ground", 3, "Kannada", "Wants to open before Diwali"];
const row = (id: string, o: Partial<Record<number, string | number | null>> = {}): (string | number | null)[] => {
  const base: (string | number | null)[] = [id, "Asha Rao", "Mysuru", "Karnataka", 570002, 30, 4, "Footwear shop", "Rented", 500, "Ground", 4, "English", ""];
  for (const [i, v] of Object.entries(o)) base[Number(i)] = v as string | number | null;
  return base;
};

async function read(apps: (string | number | null)[][], extra: Parameters<typeof workbook>[0] extends infer T ? Partial<T> : never = {}): Promise<ReadResult> {
  const buf = await workbook({ apps, ...(extra as object) });
  const res = await readWorkbook(buf, "test.xlsx");
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("reading the workbook", () => {
  it("skips only the template's exact example row, and says which row", async () => {
    const r = await read([EXAMPLE, row("APP-002")]);
    expect(r.applications.map((a) => a.id)).toEqual(["APP-002"]);
    expect(r.health.exampleRowSkipped).toBe(true);
    expect(r.health.exampleRow).toBe(3);
  });
  it("keeps an application that only looks like the example", async () => {
    const changed = [...EXAMPLE];
    changed[5] = 26;
    const r = await read([changed]);
    expect(r.applications).toHaveLength(1);
    expect(r.health.exampleRowSkipped).toBe(false);
  });
  it("reads a pin stored as a decimal and records the change with its row", async () => {
    const r = await read([row("APP-002", { 4: "560010.0" }), row("APP-003", { 4: 570001.0 })]);
    expect(r.applications.map((a) => a.pin)).toEqual(["560010", "570001"]);
    expect(r.health.changes.some((c) => c.id === "APP-002" && /560010\.0/.test(c.text) && c.row === 3)).toBe(true);
  });
  it("splits comma-separated territory pins and removes repeats", async () => {
    const r = await read([row("APP-002")], { territories: [["TER-01", "Mysuru", "Karnataka", "570001, 570002 ,570002,570008", "Tier 2", 3, "High"]] });
    expect(r.territories[0].pins).toEqual(["570001", "570002", "570008"]);
  });
  it("keeps the template's territory row when it is real data", async () => {
    const r = await read([row("APP-002")], { territories: [["TER-01", "Mysuru", "Karnataka", "570001, 570002, 570008", "Tier 2", 3, "High"]] });
    expect(r.territories).toHaveLength(1);
  });
  it("replaces the template's example territory row when the real TER-01 is added below it", async () => {
    const r = await read([row("APP-002")], { territories: [["TER-01", "Mysuru", "Karnataka", "570001, 570002, 570008", "Tier 2", 3, "High"], ["TER-01", "Mysuru", "Karnataka", "570001, 570003", "Tier 2", 2, "Medium"]] });
    expect(r.territories).toHaveLength(1);
    expect(r.territories[0].pins).toEqual(["570001", "570003"]);
    expect(r.territories[0].slots).toBe(2);
  });
  it("accepts blank optional fields and counts the blanks per column", async () => {
    const r = await read([row("APP-002", { 13: null, 9: null, 10: null, 8: "Not yet identified" }), row("APP-003", { 13: null })]);
    expect(r.applications).toHaveLength(2);
    expect(r.applications[0].size).toBeNull();
    const blank = (c: string) => r.health.blanks.find((b) => b.column === c)?.count ?? 0;
    expect(blank("Notes from applicant")).toBe(2);
    expect(blank("Space size (sq ft)")).toBe(1);
  });
  it("reads a language written in free text", async () => {
    const r = await read([row("APP-002", { 12: "kannada & english" }), row("APP-003", { 12: "ಕನ್ನಡ" }), row("APP-004", { 12: "Hindi" }), row("APP-005", { 12: "tulu" }), row("APP-006", { 12: null })]);
    expect(r.applications.map((a) => a.language)).toEqual(["Kannada", "Kannada", "Hindi", "English", "English"]);
    expect(r.health.changes.filter((c) => /Preferred language/.test(c.text))).toHaveLength(4);
  });
  it("keeps the first of a duplicate Application ID and reports the row", async () => {
    const r = await read([row("APP-002"), row("APP-002", { 1: "Someone Else" })]);
    expect(r.applications).toHaveLength(1);
    expect(r.applications[0].name).toBe("Asha Rao");
    expect(r.health.errors.some((e) => e.sheet === "Applications" && e.row === 4 && /already appears in row 3/.test(e.text))).toBe(true);
  });
  it("reads city spellings and values written with units", async () => {
    const r = await read([row("APP-002", { 2: "Mysore", 5: "25 lakh" })]);
    expect(r.applications[0].city).toBe("Mysuru");
    expect(r.applications[0].investment).toBe(25);
    expect(r.health.changes.some((c) => /Mysore/.test(c.text))).toBe(true);
  });
  it("groups errors by sheet with row numbers", async () => {
    const r = await read([row("APP-002", { 4: 5700 }), row("", {})], { territories: [["TER-01", "Mysuru", "Karnataka", "570001, 57000", "Tier 2", "many", "High"], ["TER-01", "Mysuru", "Karnataka", "570001", "Tier 2", 1, "High"]], stores: [["ST-01", "Mysuru", 5700, 2020]] });
    const sheets = new Set(r.health.errors.map((e) => e.sheet));
    expect(sheets).toEqual(new Set(["Applications", "Territories", "Existing stores"]));
    expect(r.health.errors.every((e) => e.row >= 3)).toBe(true);
  });
  it("tells the user which sheet is missing", async () => {
    const buf = await workbook({ apps: [], skipSheet: "Applications" });
    const res = await readWorkbook(buf, "x.xlsx");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Applications is missing/);
  });
  it("rejects files that are not real .xlsx files", async () => {
    expect((await readWorkbook(Buffer.from("hello"), "x.xlsx")).ok).toBe(false);
    expect((await readWorkbook(Buffer.from("PK\u0003\u0004 vbaProject.bin"), "x.xlsx")).ok).toBe(false);
    expect((await readWorkbook(Buffer.from("x"), "x.csv")).ok).toBe(false);
  });
  it("uses the fixed ten stores when the sheet has none", async () => {
    const r = await read([row("APP-002")], { stores: [] });
    expect(r.stores).toHaveLength(10);
  });
});
