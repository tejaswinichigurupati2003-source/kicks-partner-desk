"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ASSUMPTIONS, mergeAssumptions, type Assumptions } from "@/engine/config";
import { useDesk } from "@/lib/desk";
import type { DiffCard } from "@/lib/diffcard";
import { DiffCardView } from "@/components/DiffCardView";
import { Card, ErrorBanner, Loading, PageHeader } from "@/components/ui";

type Kind = "number" | "boolean";

interface Field {
  /** Path into the assumptions, for example "weights.investment" or "sizeIdeal.0". */
  path: string;
  label: string;
  help: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  kind?: Kind;
}

interface Group {
  title: string;
  intro: string;
  fields: Field[];
}

const w = (key: string, label: string, help: string): Field => ({ path: `weights.${key}`, label, help, unit: "points", min: 0, max: 100, step: 1 });
const share = (path: string, label: string, help: string): Field => ({ path, label, help, unit: "0 to 1", min: 0, max: 1, step: 0.05 });
const weeks = (key: string, label: string, help: string): Field => ({ path: `stageWeeks.${key}`, label, help, unit: "weeks", min: 0, max: 52, step: 1, integer: true });

const GROUPS: Group[] = [
  {
    title: "Money",
    intro: "What a store costs and how much shortfall we accept.",
    fields: [
      { path: "setupCost.1", label: "Setup cost, Tier 1 city", help: "Total to open a store in a large city.", unit: "₹ lakh", min: 1, max: 500, step: 0.5 },
      { path: "setupCost.2", label: "Setup cost, Tier 2 city", help: "Total to open a store in a mid-size city.", unit: "₹ lakh", min: 1, max: 500, step: 0.5 },
      { path: "setupCost.3", label: "Setup cost, Tier 3 town", help: "Total to open a store in a smaller town.", unit: "₹ lakh", min: 1, max: 500, step: 0.5 },
      { path: "minInvestmentPctOfSetup", label: "Minimum investment", help: "The least an applicant must have, as a share of the setup cost.", unit: "% of setup", min: 10, max: 200, step: 1 },
      { path: "investmentTolerancePct", label: "Shortfall we accept", help: "How far below the minimum is still approved, with a condition to show the rest.", unit: "%", min: 0, max: 100, step: 1 },
      { path: "investmentCapRatio", label: "Investment points cap", help: "Money above this multiple of the setup cost earns no extra points.", unit: "× setup", min: 1, max: 5, step: 0.05 },
    ],
  },
  {
    title: "Score weights",
    intro: "How the 100 points are split. They must add up to 100.",
    fields: [
      w("investment", "Investment", "Points for how much the applicant can invest."),
      w("space", "Space readiness", "Points for owning or renting a good shop space."),
      w("experience", "Retail experience", "Points for years of running a shop, plus a small business-background bonus."),
      w("timeline", "Timeline realism", "Points for a target launch that is realistic."),
      w("priority", "Area priority", "Points for applying in an area we are keen to grow in."),
      w("completeness", "Complete application", "Points for a complete, consistent application."),
    ],
  },
  {
    title: "Scoring shares",
    intro: "Parts of each weight earned in different situations, and when someone is too weak to get an opening.",
    fields: [
      share("priorityFactor.High", "High-priority area", "Share of the area-priority points earned in a High-priority area."),
      share("priorityFactor.Medium", "Medium-priority area", "Share of the area-priority points earned in a Medium-priority area."),
      share("priorityFactor.Low", "Low-priority area", "Share of the area-priority points earned in a Low-priority area."),
      share("experienceShare.none", "Experience: none", "Share of the experience points for 0 years."),
      share("experienceShare.low", "Experience: 1 to 2 years", "Share of the experience points for 1 to 2 years."),
      share("experienceShare.mid", "Experience: 3 to 5 years", "Share of the experience points for 3 to 5 years."),
      share("experienceShare.high", "Experience: 6+ years", "Share of the experience points for 6 or more years."),
      { path: "businessBonusMax", label: "Business background bonus", help: "Most points a footwear or retail background can add inside retail experience.", unit: "points", min: 0, max: 10, step: 0.5 },
      share("spaceShare.owned", "Owned space", "Share of the space points for a shop the applicant owns."),
      share("spaceShare.rented", "Rented space", "Share of the space points for a rented shop."),
      { path: "minScoreToAllocate", label: "Minimum score for an opening", help: "Below this overall score nobody gets an opening.", unit: "out of 100", min: 0, max: 100, step: 1 },
      { path: "spaceReadyFirst", label: "Applicants with a space go first", help: "Place applicants who already have a usable space before those who don't, whatever their score.", kind: "boolean" },
    ],
  },
  {
    title: "Space and floor",
    intro: "How the shop's floor and size change the space points.",
    fields: [
      share("floorFactor.ground", "Ground floor", "Share of the space points kept on the ground floor."),
      share("floorFactor.mall", "Mall unit", "Share of the space points kept for a mall unit."),
      share("floorFactor.upper", "Upper floor", "Share of the space points kept on an upper floor."),
      share("floorFactor.unknown", "Floor not known", "Share of the space points kept when the floor isn't known."),
      { path: "sizeIdeal.0", label: "Ideal size, from", help: "Smallest shop size that counts as ideal.", unit: "sq ft", min: 0, max: 10000, step: 10, integer: true },
      { path: "sizeIdeal.1", label: "Ideal size, to", help: "Largest shop size that counts as ideal.", unit: "sq ft", min: 0, max: 10000, step: 10, integer: true },
      { path: "sizeNear.0", label: "Acceptable size, from", help: "Smallest shop size that still earns a reduced share.", unit: "sq ft", min: 0, max: 10000, step: 10, integer: true },
      { path: "sizeNear.1", label: "Acceptable size, to", help: "Largest shop size that still earns a reduced share.", unit: "sq ft", min: 0, max: 10000, step: 10, integer: true },
      share("sizeFactor.ideal", "Ideal size", "Share of the space points kept for an ideal size."),
      share("sizeFactor.near", "Acceptable size", "Share of the space points kept for an acceptable size."),
      share("sizeFactor.other", "Any other size", "Share of the space points kept for any other size."),
    ],
  },
  {
    title: "Timeline stage lengths",
    intro: "How long each stage takes. They set the earliest realistic launch and the dated plan.",
    fields: [
      weeks("findSpace", "Find a space", "Time to find and agree a shop space, for applicants without one."),
      weeks("siteApproval", "Site approval", "Site visit and landlord consent."),
      weeks("agreement", "Franchise agreement", "Checks before we sign, then the agreement and fee."),
      weeks("fitOut", "Shop fit-out", "Layout, racks, display and signage."),
      weeks("hiring", "Hiring", "Hiring the store manager and sales staff. Runs beside fit-out."),
      weeks("training", "Training", "Training period. Runs beside inventory."),
      weeks("inventory", "Inventory", "Software set-up and opening stock. Runs beside training."),
      weeks("softLaunch", "Soft launch", "Opening checklist and first-week support."),
      { path: "conditionDays", label: "Days an opening is held", help: "How long an opening waits for a condition to be met.", unit: "days", min: 1, max: 180, step: 1, integer: true },
    ],
  },
  {
    title: "Payback",
    intro: "Inputs for how many months a store takes to earn back the investment.",
    fields: [
      { path: "monthlySales.1", label: "Monthly sales, Tier 1", help: "Typical monthly sales in a large city.", unit: "₹ lakh", min: 0.1, max: 200, step: 0.5 },
      { path: "monthlySales.2", label: "Monthly sales, Tier 2", help: "Typical monthly sales in a mid-size city.", unit: "₹ lakh", min: 0.1, max: 200, step: 0.5 },
      { path: "monthlySales.3", label: "Monthly sales, Tier 3", help: "Typical monthly sales in a smaller town.", unit: "₹ lakh", min: 0.1, max: 200, step: 0.5 },
      share("takeHome.rented.1", "Take-home, rented, Tier 1", "Partner's share of sales after royalty, rent, staff and costs."),
      share("takeHome.rented.2", "Take-home, rented, Tier 2", "Partner's share of sales after royalty, rent, staff and costs."),
      share("takeHome.rented.3", "Take-home, rented, Tier 3", "Partner's share of sales after royalty, rent, staff and costs."),
      share("takeHome.owned.1", "Take-home, owned, Tier 1", "Higher because there is no rent."),
      share("takeHome.owned.2", "Take-home, owned, Tier 2", "Higher because there is no rent."),
      share("takeHome.owned.3", "Take-home, owned, Tier 3", "Higher because there is no rent."),
      { path: "salesRangePct", label: "Sales range", help: "How far sales are assumed to be above and below typical, to give a payback range.", unit: "%", min: 0, max: 90, step: 1 },
      { path: "earnBackTargetMonths", label: "Payback target", help: "Months we aim to earn the investment back within.", unit: "months", min: 1, max: 120, step: 1, integer: true },
    ],
  },
  {
    title: "Training",
    intro: "How long partners are trained, by experience.",
    fields: [
      { path: "trainingDays.none", label: "No experience", help: "Days of training for a first-time shop owner, including days in an existing store.", unit: "days", min: 1, max: 60, step: 1, integer: true },
      { path: "trainingDays.low", label: "1 to 2 years", help: "Days of training for a partner with some experience.", unit: "days", min: 1, max: 60, step: 1, integer: true },
      { path: "trainingDays.high", label: "3+ years", help: "Days of training on Kicks modules only.", unit: "days", min: 1, max: 60, step: 1, integer: true },
      { path: "trainingHoursPerDay", label: "Hours per training day", help: "Used to turn days into total training hours.", unit: "hours", min: 1, max: 12, step: 0.5 },
    ],
  },
  {
    title: "Other",
    intro: "Smaller settings.",
    fields: [
      { path: "nearbyPinDistance", label: "Nearby store distance", help: "A store whose pin code is this close is flagged as one that may lose customers.", unit: "pin numbers", min: 0, max: 1000, step: 1, integer: true },
      { path: "priorityBonus.High", label: "Start-here bonus, High", help: "Points added to a score to order the Start here list.", unit: "points", min: 0, max: 50, step: 1 },
      { path: "priorityBonus.Medium", label: "Start-here bonus, Medium", help: "Points added to a score to order the Start here list.", unit: "points", min: 0, max: 50, step: 1 },
      { path: "priorityBonus.Low", label: "Start-here bonus, Low", help: "Points added to a score to order the Start here list.", unit: "points", min: 0, max: 50, step: 1 },
      { path: "shortlistSize", label: "Start-here list length", help: "How many applicants the Start here list shows.", unit: "applicants", min: 1, max: 50, step: 1, integer: true },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o === null || o === undefined ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** Sets a value inside a copy of the object, creating nested objects and arrays as needed. */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      cur[k] = value;
      return;
    }
    const nextIsIndex = /^\d+$/.test(keys[i + 1]);
    const existing = cur[k];
    if (existing === undefined || existing === null) cur[k] = nextIsIndex ? [] : {};
    cur = cur[k] as Record<string, unknown>;
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toDraft(a: Assumptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ALL_FIELDS) out[f.path] = String(getPath(a, f.path));
  return out;
}

/** Reads the draft as a full set of assumptions, or returns the errors. */
function readDraft(draft: Record<string, string>): { assumptions: Assumptions | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const full = JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)) as unknown as Record<string, unknown>;
  for (const f of ALL_FIELDS) {
    const raw = draft[f.path] ?? "";
    if (f.kind === "boolean") {
      setPath(full, f.path, raw === "true");
      continue;
    }
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) {
      errors[f.path] = "Enter a number.";
      continue;
    }
    if (f.integer && !Number.isInteger(n)) errors[f.path] = "Use a whole number.";
    else if (f.min !== undefined && n < f.min) errors[f.path] = `Must be at least ${f.min}.`;
    else if (f.max !== undefined && n > f.max) errors[f.path] = `Must be at most ${f.max}.`;
    setPath(full, f.path, n);
  }
  const a = full as unknown as Assumptions;
  const total = Object.values(a.weights).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (Math.abs(total - 100) > 1e-9) for (const k of Object.keys(a.weights)) errors[`weights.${k}`] ||= "The six weights must add up to 100.";
  if (a.sizeIdeal[0] > a.sizeIdeal[1]) errors["sizeIdeal.1"] ||= "Must not be less than the start of the range.";
  if (a.sizeNear[0] > a.sizeNear[1]) errors["sizeNear.1"] ||= "Must not be less than the start of the range.";
  return { assumptions: Object.keys(errors).length ? null : a, errors };
}

/** Only the values that differ from the defaults, so the saved settings stay small and old saves keep working. */
function diffFromDefaults(a: Assumptions): Partial<Assumptions> {
  const out: Record<string, unknown> = {};
  for (const f of ALL_FIELDS) {
    const v = getPath(a, f.path);
    if (!same(v, getPath(DEFAULT_ASSUMPTIONS, f.path))) {
      const top = f.path.split(".")[0];
      const topValue = (a as unknown as Record<string, unknown>)[top];
      if (Array.isArray(topValue)) out[top] = topValue; // arrays are replaced whole
      else setPath(out, f.path, v);
    }
  }
  return out as Partial<Assumptions>;
}

function countChanged(a: Assumptions): number {
  return ALL_FIELDS.filter((f) => !same(getPath(a, f.path), getPath(DEFAULT_ASSUMPTIONS, f.path))).length;
}

export default function AssumptionsPage() {
  const desk = useDesk();
  const saved = useMemo(() => mergeAssumptions(desk.ws.assumptions), [desk.ws.assumptions]);
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(saved));
  const [card, setCard] = useState<DiffCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Show the saved values again after a save, a reset, or a teammate's change.
  useEffect(() => {
    setDraft(toDraft(JSON.parse(savedKey) as Assumptions));
  }, [savedKey]);

  const { assumptions: parsed, errors } = useMemo(() => readDraft(draft), [draft]);
  const dirty = useMemo(() => ALL_FIELDS.some((f) => draft[f.path] !== String(getPath(saved, f.path))), [draft, saved]);
  const weightTotal = Object.keys(DEFAULT_ASSUMPTIONS.weights).reduce((s, k) => s + (Number(draft[`weights.${k}`]) || 0), 0);
  const changed = countChanged(saved);

  if (!desk.ready) return <Loading />;

  async function saveAll() {
    if (!parsed || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await desk.setAssumptions(diffFromDefaults(parsed), "Changed assumptions and re-ran every decision.");
    setCard(result);
    setMessage(result ? null : desk.localOnly ? "Applied in this tab. Saving isn't available, so there is no change list." : null);
    setBusy(false);
  }

  async function reset() {
    if (busy || !window.confirm("Put every assumption back to its default? Every decision is re-run.")) return;
    setBusy(true);
    setMessage(null);
    const result = await desk.setAssumptions({}, "Reset assumptions to defaults and re-ran every decision.");
    setCard(result);
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        title="Assumptions"
        intro="Every number the decision rules use. Change one and every decision is re-run, with a list of everyone it moved. Each value here is an assumption, not a fact."
        action={
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-ghost" onClick={reset} disabled={busy || changed === 0}>
              Reset to defaults
            </button>
            <button className="btn" onClick={saveAll} disabled={busy || !dirty || !parsed}>
              {busy ? "Saving…" : "Save and re-run"}
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
        <span className={`stamp stamp-flat ${dirty ? "s-conditional" : "s-approved"}`}>{dirty ? "Unsaved changes" : "Saved"}</span>
        <span className="text-sm text-muted">
          {changed === 0 ? "Using the default values." : `${changed} value${changed === 1 ? "" : "s"} differ from the defaults.`}
          {desk.save === "saving" ? " Saving…" : ""}
        </span>
      </div>

      {Object.keys(errors).length > 0 && dirty && <ErrorBanner>Some values need fixing before you can save. {errors["weights.investment"]?.includes("add up") ? `The weights add up to ${weightTotal}, not 100.` : ""}</ErrorBanner>}
      {message && <p className="mb-4 text-sm text-muted">{message}</p>}

      {card && (
        <div className="mb-6">
          <DiffCardView card={card} onClose={() => setCard(null)} />
        </div>
      )}

      <div className="space-y-6">
        {GROUPS.map((g) => (
          <Card key={g.title} className="p-5">
            <section aria-labelledby={`g-${g.title}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`g-${g.title}`} className="font-display-up text-[18px] leading-tight">
                  {g.title}
                </h2>
                {g.title === "Score weights" && (
                  <p className={`text-sm font-bold ${Math.abs(weightTotal - 100) > 1e-9 ? "text-danger" : "text-[#0e6b43]"}`} aria-live="polite">
                    {Math.abs(weightTotal - 100) > 1e-9 && <span aria-hidden="true">! </span>}Total: {Math.round(weightTotal * 100) / 100} of 100
                  </p>
                )}
              </div>
              <p className="mb-3 text-sm text-muted">{g.intro}</p>
              <ul className="divide-y divide-soft-line">
                {g.fields.map((f) => {
                  const id = `a-${f.path.replace(/\./g, "-")}`;
                  const err = errors[f.path];
                  const isDefault = draft[f.path] === String(getPath(DEFAULT_ASSUMPTIONS, f.path));
                  return (
                    <li key={f.path} className="grid gap-2 py-3 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={id} className="font-bold">
                            {f.label}
                          </label>
                          <span className="rounded-full border border-[#cdd6e6] bg-[#f3f6fc] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#3b4558]">assumption</span>
                          {!isDefault && <span className="rounded-full bg-[#fff0c2] px-2 py-0.5 text-[11px] font-bold text-[#7a4a00]">changed</span>}
                        </div>
                        <p id={`${id}-help`} className="text-sm text-muted">
                          {f.help} <span className="mono text-xs">Default {String(getPath(DEFAULT_ASSUMPTIONS, f.path))}{f.unit && f.kind !== "boolean" ? ` ${f.unit}` : ""}.</span>
                        </p>
                        {err && (
                          <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-semibold text-danger">
                            <span aria-hidden="true">! </span>
                            {err}
                          </p>
                        )}
                      </div>
                      {f.kind === "boolean" ? (
                        <label className="flex min-h-[44px] items-center gap-3 font-semibold">
                          <input id={id} type="checkbox" className="h-5 w-5 accent-[#1f4fd8]" checked={draft[f.path] === "true"} onChange={(e) => setDraft((d) => ({ ...d, [f.path]: String(e.target.checked) }))} aria-describedby={`${id}-help`} />
                          {draft[f.path] === "true" ? "On" : "Off"}
                        </label>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            id={id}
                            className="field mono"
                            type="number"
                            inputMode="decimal"
                            step={f.step}
                            min={f.min}
                            max={f.max}
                            value={draft[f.path] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                            aria-invalid={err ? true : undefined}
                            aria-describedby={err ? `${id}-help ${id}-err` : `${id}-help`}
                            style={err ? { borderColor: "var(--error)" } : undefined}
                          />
                          {f.unit && <span className="w-[84px] shrink-0 text-xs text-muted">{f.unit}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button className="btn" onClick={saveAll} disabled={busy || !dirty || !parsed}>
          {busy ? "Saving…" : "Save and re-run"}
        </button>
        <button className="btn btn-ghost" onClick={() => setDraft(toDraft(saved))} disabled={busy || !dirty}>
          Discard edits
        </button>
      </div>
    </>
  );
}
