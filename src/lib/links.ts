"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMessage } from "@/engine/messages";
import { stagesFor } from "@/engine/plans";
import type { Application, Decision } from "@/engine/types";
import type { Snapshot } from "@/lib/token";
import type { StageStatus } from "@/engine/plans";

function nextSteps(d: Decision): string[] {
  if (d.status === "approved" || d.status === "conditional") {
    const out = d.condition.map((c) => c.text);
    return [...out, "Send your ID and address proof.", "Keep the shop ready for a site visit.", "Keep your bank statements ready for our finance team."].slice(0, 5);
  }
  if (d.status === "needs_info") return [d.ask ?? "Please reply with the missing detail."];
  if (d.status === "waiting") return ["Nothing to do yet. We'll tell you as soon as an opening comes up.", ...d.offers.slice(0, 2).map((o) => `Other option: ${o.city} (pin codes ${o.pins.join(", ")}).`)];
  return ["Nothing to do right now."];
}

export function makeSnapshot(a: Application, d: Decision, stages: Record<string, StageStatus> | undefined, now: Date): Snapshot {
  const text = buildMessage(a, d, a.language, { now, link: "{link}" });
  const message = text.replace(/\n[^\n]*\{link\}[^\n]*$/, "").slice(0, 1500);
  return {
    v: 1,
    id: a.id,
    name: a.name || "",
    lang: a.language,
    status: d.status,
    city: a.city,
    pin: a.pin,
    verdict: d.verdict.slice(0, 400),
    next: nextSteps(d).map((x) => x.slice(0, 300)),
    message,
    stages:
      d.status === "approved" || d.status === "conditional"
        ? stagesFor(d).map((s) => ({ name: s.name, owner: s.owner, weeks: s.n === 0 ? "first 30 days" : `week ${s.from}–${s.to}`, status: stages?.[s.key] ?? "Not started" }))
        : [],
    offers: d.offers.slice(0, 3).map((o) => `${o.city}: pin codes ${o.pins.join(", ")} (${o.openingsLeft} opening${o.openingsLeft === 1 ? "" : "s"} left)`),
    asOf: now.toISOString().slice(0, 10),
  };
}

/** Asks the server to sign a private status link for each applicant. */
export function useStatusLinks(
  items: { app: Application; decision: Decision; stages?: Record<string, StageStatus> }[],
  now: Date,
): { links: Record<string, string>; loading: boolean } {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const payload = useMemo(() => items.map((i) => makeSnapshot(i.app, i.decision, i.stages, now)), [items, now]);
  const key = JSON.stringify(payload);
  useEffect(() => {
    if (payload.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/status-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payload }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { tokens: Record<string, string> }) => !cancelled && setTokens(d.tokens))
      .catch(() => !cancelled && setTokens({}))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const links: Record<string, string> = {};
  for (const [id, t] of Object.entries(tokens)) links[id] = `${origin}/status/${t}`;
  return { links, loading };
}
