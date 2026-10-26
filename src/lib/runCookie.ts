import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "kicks_run";
export const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readRunId(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v && RUN_ID.test(v) ? v : null;
}

export async function setRunId(id: string): Promise<void> {
  (await cookies()).set(COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}

export function newRunId(): string {
  return randomUUID();
}
