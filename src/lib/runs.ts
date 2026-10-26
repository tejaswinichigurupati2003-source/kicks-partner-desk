import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomInt, randomUUID } from "node:crypto";
import { EXISTING_STORES } from "@/engine/config";
import { run } from "@/engine/run";
import { buildDiffCard, type DiffCard, type Trigger } from "./diffcard";
import { applyPatch, assumptionDelta, makePatch, type UndoPatch } from "./patch";
import { normaliseWorkspace, toRunInput, type Workspace } from "./workspace";

export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

const q = () => neon(process.env.DATABASE_URL as string);

let ready: Promise<void> | null = null;

/** Creates the tables the first time they are needed. Tables are only reached through server routes. */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = q();
      await sql`CREATE TABLE IF NOT EXISTS runs (
        id uuid PRIMARY KEY,
        data jsonb NOT NULL,
        rev integer NOT NULL DEFAULT 1,
        file_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS applications (
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        application_id text NOT NULL,
        row_no integer,
        data jsonb NOT NULL,
        PRIMARY KEY (run_id, application_id)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS territories (
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        territory_id text NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (run_id, territory_id)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS existing_stores (
        store_id text PRIMARY KEY,
        city text NOT NULL,
        pin text NOT NULL,
        opened_year integer
      )`;
      await sql`CREATE TABLE IF NOT EXISTS decisions (
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        application_id text NOT NULL,
        status text NOT NULL,
        score numeric,
        assigned_pin text,
        territory_id text,
        verdict text,
        reason_trail jsonb,
        decided_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (run_id, application_id)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS decision_events (
        id bigserial PRIMARY KEY,
        group_id uuid NOT NULL,
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        application_id text,
        trigger text NOT NULL,
        actor text NOT NULL,
        summary text NOT NULL,
        before jsonb,
        after jsonb,
        patch jsonb,
        undone boolean NOT NULL DEFAULT false,
        at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS decision_events_run ON decision_events (run_id, at DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS chat_messages (
        id bigserial PRIMARY KEY,
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        role text NOT NULL,
        content text NOT NULL,
        cards jsonb,
        at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS status_links (
        token text PRIMARY KEY,
        run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        application_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (run_id, application_id)
      )`;
      for (const t of ["runs", "applications", "territories", "existing_stores", "decisions", "decision_events", "chat_messages", "status_links"]) {
        await sql.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      }
      await sql`INSERT INTO existing_stores (store_id, city, pin, opened_year)
        SELECT x.store_id, x.city, x.pin, x.opened_year FROM jsonb_to_recordset(${JSON.stringify(EXISTING_STORES.map((s) => ({ store_id: s.id, city: s.city, pin: s.pin, opened_year: s.year })))}::jsonb)
        AS x(store_id text, city text, pin text, opened_year int) ON CONFLICT (store_id) DO NOTHING`;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

export interface Stored {
  data: Workspace;
  rev: number;
}

export async function loadRun(id: string): Promise<Stored | null> {
  await ensureSchema();
  const rows = await q()`SELECT data, rev FROM runs WHERE id = ${id}::uuid AND updated_at > now() - interval '7 days'`;
  return rows[0] ? { data: normaliseWorkspace(rows[0].data as Partial<Workspace>), rev: Number(rows[0].rev) } : null;
}

export async function runExists(id: string): Promise<boolean> {
  await ensureSchema();
  return (await q()`SELECT 1 FROM runs WHERE id = ${id}::uuid AND updated_at > now() - interval '7 days'`).length > 0;
}

/** Keeps the readable tables in step with the run: applications, areas and the current decisions. */
async function mirror(id: string, ws: Workspace): Promise<void> {
  const result = run(toRunInput(ws));
  const sql = q();
  const apps = JSON.stringify(ws.applications.map((a) => ({ application_id: a.id, row_no: a.row ?? null, data: a })));
  const ters = JSON.stringify(ws.territories.map((t) => ({ territory_id: t.id, data: t })));
  const decs = JSON.stringify(
    Object.values(result.decisions).map((d) => ({ application_id: d.id, status: d.status, score: d.score, assigned_pin: d.assignedPin, territory_id: d.territoryId, verdict: d.verdict, reason_trail: d.reasonTrail })),
  );
  await sql.transaction([
    sql`DELETE FROM applications WHERE run_id = ${id}::uuid`,
    sql`INSERT INTO applications (run_id, application_id, row_no, data) SELECT ${id}::uuid, x.application_id, x.row_no, x.data FROM jsonb_to_recordset(${apps}::jsonb) AS x(application_id text, row_no int, data jsonb)`,
    sql`DELETE FROM territories WHERE run_id = ${id}::uuid`,
    sql`INSERT INTO territories (run_id, territory_id, data) SELECT ${id}::uuid, x.territory_id, x.data FROM jsonb_to_recordset(${ters}::jsonb) AS x(territory_id text, data jsonb)`,
    sql`DELETE FROM decisions WHERE run_id = ${id}::uuid`,
    sql`INSERT INTO decisions (run_id, application_id, status, score, assigned_pin, territory_id, verdict, reason_trail) SELECT ${id}::uuid, x.application_id, x.status, x.score, x.assigned_pin, x.territory_id, x.verdict, x.reason_trail FROM jsonb_to_recordset(${decs}::jsonb) AS x(application_id text, status text, score numeric, assigned_pin text, territory_id text, verdict text, reason_trail jsonb)`,
  ]);
}

export interface SaveMeta {
  trigger: Trigger;
  actor: string;
  summary: string;
  targetId?: string | null;
}

const compact = (d: ReturnType<typeof run>["decisions"][string] | undefined) =>
  d ? { status: d.status, score: d.score, pin: d.assignedPin, position: d.position, rank: d.rank, conditions: d.condition.map((c) => c.text) } : null;

async function writeEvents(id: string, before: Workspace | null, after: Workspace, meta: SaveMeta, undoable: boolean): Promise<{ groupId: string | null; card: DiffCard | null }> {
  const beforeRun = run(toRunInput(before ?? { ...after, applications: [], territories: after.territories }));
  const afterRun = run(toRunInput(after));
  const names = Object.fromEntries(after.applications.map((a) => [a.id, a.name]));
  const groupId = randomUUID();
  const card = buildDiffCard(beforeRun, afterRun, names, meta.targetId ?? null, { trigger: meta.trigger, summary: meta.summary, groupId, undoable });
  const rows = before ? [...(card.target ? [card.target] : []), ...card.knockOn] : [];
  const patch = before ? makePatch(before, after) : null;
  const always = ["import", "chat", "assumption", "override", "undo", "territory", "note"].includes(meta.trigger);
  if (rows.length === 0 && !always) return { groupId: null, card: null };
  const header = {
    application_id: null as string | null,
    before: before && meta.trigger === "assumption" ? assumptionDelta(before.assumptions, after.assumptions).before : null,
    after: meta.trigger === "assumption" && before ? assumptionDelta(before.assumptions, after.assumptions).after : null,
    patch: undoable ? patch : null,
  };
  const items = [
    header,
    ...rows.map((r) => ({ application_id: r.id, before: compact(beforeRun.decisions[r.id]), after: compact(afterRun.decisions[r.id]), patch: null })),
  ];
  await q()`INSERT INTO decision_events (group_id, run_id, application_id, trigger, actor, summary, before, after, patch)
    SELECT ${groupId}::uuid, ${id}::uuid, x.application_id, ${meta.trigger}, ${meta.actor}, ${meta.summary}, x.before, x.after, x.patch
    FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(application_id text, before jsonb, after jsonb, patch jsonb)`;
  return { groupId, card: { ...card, groupId, undoable: undoable && !!patch } };
}

/** A new run from an upload. Every upload gets its own unguessable id. */
export async function createRun(ws: Workspace, meta: Omit<SaveMeta, "trigger">): Promise<{ id: string; card: DiffCard | null }> {
  await ensureSchema();
  const id = randomUUID();
  await q()`INSERT INTO runs (id, data, rev, file_name) VALUES (${id}::uuid, ${JSON.stringify(ws)}::jsonb, 1, ${ws.fileName})`;
  await mirror(id, ws);
  const { card } = await writeEvents(id, null, ws, { ...meta, trigger: "import" }, false);
  return { id, card };
}

export type SaveResult = { ok: true; rev: number; groupId: string | null; card: DiffCard | null } | { ok: false; conflict: { data: Workspace | null; rev: number } };

/** Saves a run. It only goes through from the latest revision, so teammates never overwrite each other silently. */
export async function saveRun(id: string, next: Workspace, baseRev: number, meta: SaveMeta): Promise<SaveResult> {
  await ensureSchema();
  const current = await loadRun(id);
  if (!current) return { ok: false, conflict: { data: null, rev: 0 } };
  if (current.rev !== baseRev) return { ok: false, conflict: current };
  const saved = { ...next, savedAt: new Date().toISOString() };
  const upd = await q()`UPDATE runs SET data = ${JSON.stringify(saved)}::jsonb, rev = rev + 1, file_name = ${saved.fileName}, updated_at = now() WHERE id = ${id}::uuid AND rev = ${baseRev} RETURNING rev`;
  if (!upd[0]) {
    const latest = await loadRun(id);
    return { ok: false, conflict: latest ?? { data: null, rev: 0 } };
  }
  await mirror(id, saved);
  const { groupId, card } = await writeEvents(id, current.data, saved, meta, meta.trigger !== "undo");
  return { ok: true, rev: Number(upd[0].rev), groupId, card };
}

/** Puts back what a change touched. */
export async function undoGroup(id: string, groupId: string, actor: string): Promise<{ ok: true; rev: number; card: DiffCard | null } | { ok: false; reason: string }> {
  await ensureSchema();
  const sql = q();
  const rows = await sql`SELECT patch, summary, undone FROM decision_events WHERE run_id = ${id}::uuid AND group_id = ${groupId}::uuid AND application_id IS NULL LIMIT 1`;
  if (!rows[0]) return { ok: false, reason: "not_found" };
  if (rows[0].undone) return { ok: false, reason: "already_undone" };
  if (!rows[0].patch) return { ok: false, reason: "not_undoable" };
  const current = await loadRun(id);
  if (!current) return { ok: false, reason: "not_found" };
  const restored = applyPatch(current.data, rows[0].patch as UndoPatch);
  const res = await saveRun(id, restored, current.rev, { trigger: "undo", actor, summary: `Undid: ${rows[0].summary}` });
  if (!res.ok) return { ok: false, reason: "conflict" };
  await sql`UPDATE decision_events SET undone = true WHERE run_id = ${id}::uuid AND group_id = ${groupId}::uuid`;
  return { ok: true, rev: res.rev, card: res.card };
}

export interface EventRow {
  id: number;
  group_id: string;
  application_id: string | null;
  trigger: string;
  actor: string;
  summary: string;
  before: unknown;
  after: unknown;
  undone: boolean;
  undoable: boolean;
  at: string;
}

export async function listEvents(id: string, opts: { applicationId?: string | null; limit?: number } = {}): Promise<EventRow[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const app = opts.applicationId ?? null;
  const rows = await q()`SELECT id, group_id, application_id, trigger, actor, summary, before, after, undone, (patch IS NOT NULL) AS undoable, at
    FROM decision_events WHERE run_id = ${id}::uuid AND (${app}::text IS NULL OR application_id = ${app}::text)
    ORDER BY at DESC, id DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...(r as unknown as EventRow), id: Number(r.id), at: new Date(r.at as string).toISOString() }));
}

export async function addChat(id: string, role: "user" | "assistant", content: string, cards: unknown = null): Promise<void> {
  await ensureSchema();
  await q()`INSERT INTO chat_messages (run_id, role, content, cards) VALUES (${id}::uuid, ${role}, ${content}, ${cards === null ? null : JSON.stringify(cards)}::jsonb)`;
}

export async function listChat(id: string, limit = 60): Promise<{ role: "user" | "assistant"; content: string; cards: unknown; at: string }[]> {
  await ensureSchema();
  const rows = await q()`SELECT role, content, cards, at FROM chat_messages WHERE run_id = ${id}::uuid ORDER BY id DESC LIMIT ${limit}`;
  return rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content as string, cards: r.cards, at: new Date(r.at as string).toISOString() }));
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const newToken = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** One short link per applicant. Returns the existing link when there is one. */
export async function statusTokens(runId: string, applicationIds: string[]): Promise<Record<string, string>> {
  await ensureSchema();
  const sql = q();
  const have = await sql`SELECT application_id, token FROM status_links WHERE run_id = ${runId}::uuid`;
  const out: Record<string, string> = {};
  for (const r of have) out[r.application_id as string] = r.token as string;
  for (const appId of applicationIds) {
    if (out[appId]) continue;
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = newToken();
      const ins = await sql`INSERT INTO status_links (token, run_id, application_id) VALUES (${token}, ${runId}::uuid, ${appId}) ON CONFLICT DO NOTHING RETURNING token`;
      if (ins[0]) {
        out[appId] = token;
        break;
      }
      const again = await sql`SELECT token FROM status_links WHERE run_id = ${runId}::uuid AND application_id = ${appId}`;
      if (again[0]) {
        out[appId] = again[0].token as string;
        break;
      }
    }
  }
  return out;
}

export async function resolveToken(token: string): Promise<{ runId: string; applicationId: string } | null> {
  await ensureSchema();
  const rows = await q()`SELECT s.run_id, s.application_id FROM status_links s JOIN runs r ON r.id = s.run_id WHERE s.token = ${token} AND r.updated_at > now() - interval '7 days'`;
  return rows[0] ? { runId: rows[0].run_id as string, applicationId: rows[0].application_id as string } : null;
}

export interface RunSummary {
  id: string;
  fileName: string | null;
  applications: number;
  counts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  lastChange: string | null;
  expiresAt: string;
}

/** Every run still inside its 7 days, newest activity first, with a one-line picture of each. */
export async function listRuns(limit = 50): Promise<RunSummary[]> {
  await ensureSchema();
  const rows = await q()`SELECT r.id, r.file_name, r.created_at, r.updated_at, jsonb_array_length(r.data->'applications') AS apps,
      (SELECT summary FROM decision_events e WHERE e.run_id = r.id AND e.application_id IS NULL ORDER BY e.at DESC, e.id DESC LIMIT 1) AS last_change,
      COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) AS n FROM decisions d WHERE d.run_id = r.id GROUP BY status) t), '{}'::jsonb) AS counts
    FROM runs r WHERE r.updated_at > now() - interval '7 days' ORDER BY r.updated_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id as string,
    fileName: (r.file_name as string | null) ?? null,
    applications: Number(r.apps ?? 0),
    counts: (r.counts ?? {}) as Record<string, number>,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    lastChange: (r.last_change as string | null) ?? null,
    expiresAt: new Date(new Date(r.updated_at as string).getTime() + 7 * 86400_000).toISOString(),
  }));
}

export async function purgeOld(): Promise<number> {
  await ensureSchema();
  const rows = await q()`DELETE FROM runs WHERE updated_at < now() - interval '7 days' RETURNING id`;
  return rows.length;
}

export async function ping(): Promise<boolean> {
  try {
    await q()`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
