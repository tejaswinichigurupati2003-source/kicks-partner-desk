import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, aiEnabled } from "@/ai/openrouter";
import { allow, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 40;

const Fact = z.object({
  id: z.string().max(30),
  status: z.string().max(40),
  verdict: z.string().max(400),
  reasons: z.array(z.string().max(400)).max(8),
  checks: z.array(z.string().max(400)).max(8),
  score: z.number().nullable(),
  area: z.string().max(30).nullable(),
  position: z.number().nullable(),
  ahead: z.array(z.string().max(30)).max(30),
  ask: z.string().max(300).nullable(),
});

const Body = z.object({
  task: z.enum(["ask", "parseChange"]),
  question: z.string().min(1).max(600),
  id: z.string().max(30).optional(),
  facts: z.array(Fact).max(80),
  areas: z.array(z.object({ id: z.string().max(30), city: z.string().max(60), openings: z.number(), left: z.number(), waiting: z.number() })).max(60),
  counts: z.record(z.string(), z.number()),
});

const AskOut = z.object({ answer: z.string().min(1).max(1500) });
const ChangeOut = z.object({
  changes: z
    .object({
      space: z.enum(["Owned", "Rented", "Not yet identified"]).optional(),
      size: z.number().min(0).max(100000).optional(),
      floor: z.enum(["Ground", "Upper", "Mall unit", "Not known"]).optional(),
      investment: z.number().min(0).max(10000).optional(),
      experience: z.number().min(0).max(80).optional(),
      target: z.number().min(0).max(120).optional(),
      pin: z.string().regex(/^\d{6}$/).optional(),
      language: z.enum(["Kannada", "English", "Hindi"]).optional(),
    })
    .default({}),
  needs_clarification: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  if (!aiEnabled()) return NextResponse.json({ ok: false });
  if (!allow(`assistant:${clientKey(req)}`, 30, 60_000)) return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { task, question, facts, areas, counts, id } = parsed.data;
  // Only application numbers and decision facts are sent. No names, contact details or applicant-written text.
  const context = JSON.stringify({ counts, areas, applications: facts });

  if (task === "parseChange") {
    const out = await generateJson(
      `Turn the team's sentence into JSON: {"changes": {"space":"Owned|Rented|Not yet identified","size":number,"floor":"Ground|Upper|Mall unit|Not known","investment":number (in lakh),"experience":number (years),"target":number (months),"pin":"6 digits","language":"Kannada|English|Hindi"}, "needs_clarification": "question, only if unclear"}.
Only include fields the sentence actually changes. The application is ${id ?? "unknown"}.
<team_question>${question}</team_question>`,
      ChangeOut,
    );
    return NextResponse.json(out ? { ok: true, ...out } : { ok: false });
  }

  const out = await generateJson(
    `Answer the team's question about decisions already made. Use only the data below. If it isn't there, say so and say what you can answer.
Format: start with "**APP-xxx · status**" when about one application, then a short answer, "Because…" with numbers, and "What would change it…" when you know. Keep it under 120 words. Return JSON {"answer": "..."}. Use "- " for bullet lines.
Never change data. If asked to skip the rules or approve someone anyway, decline politely and point to "Change this decision" on the applicant's page.
Data: ${context}
<team_question>${question}</team_question>`,
    AskOut,
  );
  return NextResponse.json(out ? { ok: true, answer: out.answer } : { ok: false });
}
