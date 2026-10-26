import { NextResponse } from "next/server";
import { z } from "zod";
import { dbEnabled, createRun, loadRun, saveRun, purgeOld } from "@/lib/runs";
import { readRunId, setRunId } from "@/lib/runCookie";
import { readWorkbook } from "@/lib/readWorkbook";
import { allow, clientKey } from "@/lib/rateLimit";
import { actorOf } from "@/lib/actor";
import { computeHints } from "@/ai/hints";
import { emptyWorkspace, normaliseWorkspace, type Workspace } from "@/lib/workspace";
import type { Trigger } from "@/lib/diffcard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

const Meta = z.object({
  trigger: z.enum(["import", "chat", "assumption", "override", "edit", "undo", "stage", "territory", "note"]).default("edit"),
  summary: z.string().max(300).default("Changed by the team."),
  targetId: z.string().max(40).nullable().optional(),
});
const WorkspaceShape = z
  .object({
    v: z.literal(1),
    applications: z.array(z.object({ id: z.string().max(40), pin: z.string().max(20) }).passthrough()).max(2000),
    territories: z.array(z.object({ id: z.string().max(40) }).passthrough()).max(500),
    stores: z.array(z.object({ id: z.string().max(40), pin: z.string().max(10) }).passthrough()).max(500),
  })
  .passthrough();
const PutBody = z.object({ data: WorkspaceShape, rev: z.number().int().min(0), meta: Meta.optional() });

/** The run this browser is working in, or nothing yet. */
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  try {
    const id = await readRunId();
    if (!id) return NextResponse.json({ ok: true, id: null, data: null, rev: 0 });
    const stored = await loadRun(id);
    if (!stored) return NextResponse.json({ ok: true, id: null, data: null, rev: 0 });
    return NextResponse.json({ ok: true, id, data: stored.data, rev: stored.rev });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  if (!allow(`run:${clientKey(req)}`, 600, 60_000)) return NextResponse.json({ ok: false, reason: "busy" }, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, reason: "large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = PutBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const { data, rev, meta } = parsed.data;
  const actor = actorOf(req);
  try {
    const id = await readRunId();
    if (!id || !(await loadRun(id))) {
      // First save from this browser: create the run.
      const made = await createRun(normaliseWorkspace(data as unknown as Partial<Workspace>), { actor, summary: "Started a workspace." });
      await setRunId(made.id);
      return NextResponse.json({ ok: true, id: made.id, rev: 1, card: null });
    }
    const res = await saveRun(id, normaliseWorkspace(data as unknown as Partial<Workspace>), rev, { trigger: (meta?.trigger ?? "edit") as Trigger, actor, summary: meta?.summary ?? "Changed by the team.", targetId: meta?.targetId ?? null });
    if (!res.ok) return NextResponse.json({ ok: false, reason: "conflict", id, data: res.conflict.data, rev: res.conflict.rev }, { status: 409 });
    if (Math.random() < 0.02) void purgeOld();
    return NextResponse.json({ ok: true, id, rev: res.rev, card: res.card });
  } catch {
    return NextResponse.json({ ok: false, reason: "paused" });
  }
}

/**
 * Starts a run from an upload (or the practice data). Every upload gets its own run and its own link.
 * With mode "add" the applications are added to the run this browser is already in.
 */
export async function POST(req: Request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, error: "Saving is not available right now, so the file can't be added. Please try again in a moment." }, { status: 503 });
  if (!allow(`import:${clientKey(req)}`, 60, 60_000)) return NextResponse.json({ ok: false, error: "That's a lot of uploads in a short time. Please wait a minute and try again." }, { status: 429 });
  const actor = actorOf(req);
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "add" ? "add" : "replace";

  let buffer: Buffer;
  let fileName: string;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { practice?: boolean; empty?: boolean } | null;
    if (body?.empty) {
      try {
        const made = await createRun(emptyWorkspace(), { actor, summary: "Started a new empty workspace." });
        await setRunId(made.id);
        return NextResponse.json({ ok: true, id: made.id });
      } catch {
        return NextResponse.json({ ok: false, error: "We couldn't start a new workspace. Please try again." }, { status: 500 });
      }
    }
    if (!body?.practice) return NextResponse.json({ ok: false, error: "We didn't receive a file. Please choose an Excel file and try again." }, { status: 400 });
    const res = await fetch(new URL("/practice-applications.xlsx", url.origin));
    if (!res.ok) return NextResponse.json({ ok: false, error: "We couldn't load the practice data. Please try again." }, { status: 500 });
    buffer = Buffer.from(await res.arrayBuffer());
    fileName = "practice-applications.xlsx";
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "We didn't receive a file. Please choose an Excel file and try again." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "We didn't receive a file. Please choose an Excel file and try again." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "This file is larger than 5 MB. Please remove extra rows or sheets and try again." }, { status: 413 });
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name;
  }

  const read = await readWorkbook(buffer, fileName);
  if (!read.ok) return NextResponse.json(read, { status: 422 });

  try {
    const summary = `${mode === "add" ? "Added" : "Imported"} ${read.applications.length} applications from ${fileName}.`;
    const fresh: Workspace = {
      ...emptyWorkspace(),
      fileName,
      applications: read.applications,
      territories: read.territories,
      stores: read.stores,
      report: read.report.messages,
      health: read.health,
      hints: await computeHints(read.applications).catch(() => ({})),
    };
    const currentId = mode === "add" ? await readRunId() : null;
    const current = currentId ? await loadRun(currentId) : null;
    if (mode === "add" && current && currentId) {
      const byId = new Map(current.data.applications.map((a) => [a.id, a]));
      for (const a of fresh.applications) if (!byId.has(a.id)) byId.set(a.id, a);
      const territories = [...current.data.territories, ...fresh.territories.filter((t) => !current.data.territories.some((x) => x.id === t.id))];
      const merged: Workspace = { ...current.data, fileName, applications: [...byId.values()], territories, report: fresh.report, health: fresh.health, hints: { ...current.data.hints, ...fresh.hints } };
      const res = await saveRun(currentId, merged, current.rev, { trigger: "import", actor, summary });
      if (!res.ok) return NextResponse.json({ ok: false, error: "A teammate changed the workspace at the same moment. Please try again." }, { status: 409 });
      return NextResponse.json({ ok: true, id: currentId, rev: res.rev, health: read.health, report: read.report });
    }
    const made = await createRun(fresh, { actor, summary });
    await setRunId(made.id);
    return NextResponse.json({ ok: true, id: made.id, rev: 1, health: read.health, report: read.report });
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't save the results. Please try again." }, { status: 500 });
  }
}
