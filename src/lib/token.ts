import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";

export const SnapshotSchema = z.object({
  v: z.literal(1),
  id: z.string().max(40),
  name: z.string().max(120),
  lang: z.enum(["English", "Kannada", "Hindi"]),
  status: z.enum(["approved", "conditional", "needs_info", "waiting", "not_eligible"]),
  city: z.string().max(60),
  pin: z.string().max(10),
  verdict: z.string().max(400),
  next: z.array(z.string().max(300)).max(8),
  message: z.string().max(1500),
  stages: z.array(z.object({ name: z.string().max(80), owner: z.string().max(80), weeks: z.string().max(20), status: z.string().max(20) })).max(12),
  offers: z.array(z.string().max(160)).max(4),
  asOf: z.string().max(30),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

function secret(): string {
  return process.env.STATUS_SECRET || "kicks-partner-desk-status-links";
}

const b64 = (b: Buffer) => b.toString("base64url");

export function signSnapshot(s: Snapshot): string {
  const body = b64(deflateRawSync(Buffer.from(JSON.stringify(s), "utf8")));
  const sig = b64(createHmac("sha256", secret()).update(body).digest().subarray(0, 16));
  return `${body}.${sig}`;
}

export function readToken(token: string): Snapshot | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig || token.length > 8000) return null;
    const expected = createHmac("sha256", secret()).update(body).digest().subarray(0, 16);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const json = inflateRawSync(Buffer.from(body, "base64url"), { maxOutputLength: 20000 }).toString("utf8");
    const parsed = SnapshotSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
