import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "kicks_workspace";
export const ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export async function readId(): Promise<string | null> {
  const existing = (await cookies()).get(COOKIE)?.value;
  return existing && ID_PATTERN.test(existing) ? existing : null;
}

export async function setId(id: string): Promise<void> {
  (await cookies()).set(COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}

export function newId(): string {
  return randomBytes(24).toString("base64url");
}
