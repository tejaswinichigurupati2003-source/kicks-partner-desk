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
    ready = sql()`CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.then(() => undefined);
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

export async function loadWorkspace(id: string): Promise<unknown | null> {
  await ensureSchema();
  const rows = await sql()`SELECT data FROM workspaces WHERE id = ${id} AND updated_at > now() - interval '7 days'`;
  return rows[0]?.data ?? null;
}

export async function saveWorkspace(id: string, data: unknown): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO workspaces (id, data, updated_at) VALUES (${id}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
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
