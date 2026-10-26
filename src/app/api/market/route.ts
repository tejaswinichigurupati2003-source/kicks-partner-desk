import { NextResponse } from "next/server";
import { z } from "zod";
import { CONFIG } from "@/engine/config";
import { generateJson, aiEnabled } from "@/ai/openrouter";
import { searchEnabled, webSearch, type WebHit } from "@/ai/langsearch";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 50;

const Body = z.object({ city: z.string().max(40) });
const Summary = z.object({ points: z.array(z.object({ text: z.string().max(400), sources: z.array(z.number().int()).max(4) })).max(6) });

const cache = new Map<string, { at: number; value: unknown }>();
const SIX_HOURS = 6 * 3600_000;

export async function POST(req: Request) {
  if (!searchEnabled()) return NextResponse.json({ ok: false, reason: "off" });
  if (!allow(`market:${clientKey(req)}`, 12, 60_000)) return NextResponse.json({ ok: false, reason: "busy" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !CONFIG.cities[parsed.data.city]) return NextResponse.json({ ok: false, reason: "city" }, { status: 400 });
  const city = parsed.data.city.replace("-", " and ");

  const hit = cache.get(parsed.data.city);
  if (hit && Date.now() - hit.at < SIX_HOURS) return NextResponse.json(hit.value);

  const queries = [`${city} Karnataka footwear shoe retail market growth demand`, `${city} commercial shop rent retail high street areas`, `${city} shoe store brands franchise expansion competition`];
  const results = await Promise.all(queries.map((q) => webSearch(q, 5)));
  const seen = new Set<string>();
  const sources: WebHit[] = [];
  for (const r of results.flat()) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    sources.push(r);
    if (sources.length >= 10) break;
  }
  if (sources.length === 0) return NextResponse.json({ ok: false, reason: "none" });

  let points: { text: string; sources: { title: string; url: string }[] }[] = [];
  if (aiEnabled()) {
    const listing = sources.map((s, i) => `[${i}] ${s.title} (${s.date ?? "undated"}): ${s.snippet}`).join("\n");
    const out = await generateJson(
      `You are helping Kicks, a footwear retail chain, decide where to open franchise stores in ${city}. From the search results below, write up to 5 short market notes about demand for footwear, shop rents or busy retail areas, and competition. Use only facts that appear in the results; if the results say little, write fewer notes. Each note cites the result numbers it came from.
Return JSON {"points":[{"text":"...","sources":[0,2]}]}.
Results:
${listing}`,
      Summary,
    );
    if (out) points = out.points.map((p) => ({ text: p.text, sources: p.sources.filter((n) => n >= 0 && n < sources.length).map((n) => ({ title: sources[n].title, url: sources[n].url })) })).filter((p) => p.sources.length > 0);
  }
  const value = { ok: true, points, sources: sources.map((s) => ({ title: s.title, url: s.url, date: s.date })), asOf: new Date().toISOString().slice(0, 10) };
  cache.set(parsed.data.city, { at: Date.now(), value });
  return NextResponse.json(value);
}
