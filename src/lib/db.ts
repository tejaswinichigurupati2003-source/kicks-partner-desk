import "server-only";
import { neon } from "@neondatabase/serverless";

export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

let ready: Promise<void> | null = null;

function sql() {
  return neon(process.env.DATABASE_URL as string);
}

/** Creates the table the first time it is needed. */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql()`CREATE TABLE IF NOT EXISTS workspaces (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        rev integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql()`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 1`;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

export interface Stored {
  data: unknown;
  rev: number;
}

export async function loadWorkspace(id: string): Promise<Stored | null> {
  await ensureSchema();
  const rows = await sql()`SELECT data, rev FROM workspaces WHERE id = ${id} AND updated_at > now() - interval '7 days'`;
  return rows[0] ? { data: rows[0].data, rev: Number(rows[0].rev) } : null;
}

export async function workspaceExists(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql()`SELECT 1 FROM workspaces WHERE id = ${id} AND updated_at > now() - interval '7 days'`;
  return rows.length > 0;
}

/**
 * Saves a workspace. A save only goes through when it was made from the latest revision,
 * so two teammates can't silently overwrite each other.
 */
export async function saveWorkspace(id: string, data: unknown, baseRev: number): Promise<{ ok: true; rev: number } | { ok: false; conflict: Stored }> {
  await ensureSchema();
  const json = JSON.stringify(data);
  const rows = await sql()`INSERT INTO workspaces (id, data, rev, updated_at) VALUES (${id}, ${json}::jsonb, 1, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, rev = workspaces.rev + 1, updated_at = now()
    WHERE workspaces.rev = ${baseRev}
    RETURNING rev`;
  if (rows[0]) return { ok: true, rev: Number(rows[0].rev) };
  const latest = await loadWorkspace(id);
  return { ok: false, conflict: latest ?? { data: null, rev: 0 } };
}

export async function purgeOld(): Promise<number> {
  await ensureSchema();
  const rows = await sql()`DELETE FROM workspaces WHERE updated_at < now() - interval '7 days' RETURNING id`;
  return rows.length;
}

export async function ping(): Promise<boolean> {
  try {
    await sql()`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
