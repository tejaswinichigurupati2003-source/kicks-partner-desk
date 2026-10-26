"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDesk } from "@/lib/desk";
import { CONFIG } from "@/engine/config";
import { stagesFor, stageWindow } from "@/engine/plans";
import type { Status } from "@/engine/types";

export interface Alert {
  key: string;
  tone: Status;
  title: string;
  text: string;
  href: string;
}

const READ_KEY = "kicks-partner-desk-read-alerts";

/** Things that need the team's attention, worked out from the current decisions. */
export function useAlerts(): { alerts: Alert[]; unread: Alert[]; isUnread: (a: Alert) => boolean; markRead: (keys: string[]) => void } {
  const { result, ws, now, hasData } = useDesk();
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRead(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[]);
    } catch {
      setRead([]);
    }
  }, []);

  const alerts = useMemo<Alert[]>(() => {
    if (!hasData) return [];
    const decisions = Object.values(result.decisions);
    const count = (s: Status) => decisions.filter((d) => d.status === s).length;
    const suggestions = decisions.filter((d) => d.suggestions.length > 0);
    const thin = result.territories.filter((t) => t.territory.slots > t.applicants.length);
    const overdue: string[] = [];
    for (const d of decisions) {
      if (d.status !== "approved" && d.status !== "conditional") continue;
      const on = ws.approvedOn[d.id];
      if (!on) continue;
      const withZero = d.condition.some((c) => c.kind === "space");
      for (const st of stagesFor(d)) {
        if ((ws.stages[d.id]?.[st.key] ?? "Not started") !== "Done" && stageWindow(new Date(on), st, withZero && st.n !== 0).end < now) {
          overdue.push(d.id);
          break;
        }
      }
    }
    const list: Alert[] = [];
    const n = (s: Status) => count(s);
    if (n("needs_info")) list.push({ key: `needs_info:${n("needs_info")}`, tone: "needs_info", title: "Needs a reply", text: `${n("needs_info")} application(s) are waiting on an answer from the applicant.`, href: "/applications?status=needs_info" });
    if (suggestions.length) list.push({ key: `facts:${suggestions.map((d) => d.id).join(",")}`, tone: "conditional", title: "Facts to confirm", text: `${suggestions.length} application(s) have notes with new facts, such as a shop found.`, href: "/data-review" });
    if (n("conditional")) list.push({ key: `conditional:${n("conditional")}`, tone: "conditional", title: "Openings on hold", text: `${n("conditional")} approved with a condition. Each opening is held for ${CONFIG.conditionDays} days.`, href: "/applications?status=conditional" });
    if (overdue.length) list.push({ key: `overdue:${overdue.join(",")}`, tone: "not_eligible", title: "Overdue stages", text: `${overdue.length} applicant(s) have a stage that should be done by now.`, href: "/onboarding" });
    if (n("waiting")) list.push({ key: `waiting:${n("waiting")}`, tone: "waiting", title: "Waiting list", text: `${n("waiting")} applicant(s) are waiting for an opening.`, href: "/applications?status=waiting" });
    if (thin.length) list.push({ key: `thin:${thin.map((t) => t.territory.id).join(",")}`, tone: "approved", title: "Need more applicants", text: `${thin.length} area(s) have fewer applicants than openings: ${thin.map((t) => t.territory.id).join(", ")}.`, href: "/market" });
    return list;
  }, [hasData, result, ws.approvedOn, ws.stages, now]);

  const isUnread = useCallback((a: Alert) => !read.includes(a.key), [read]);
  const markRead = useCallback((keys: string[]) => {
    setRead((prev) => {
      const next = Array.from(new Set([...prev, ...keys])).slice(-200);
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: read marks last for this visit only */
      }
      return next;
    });
  }, []);

  return { alerts, unread: alerts.filter(isUnread), isUnread, markRead };
}
