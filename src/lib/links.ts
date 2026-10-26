"use client";

import { useEffect, useState } from "react";
import { useDesk } from "@/lib/desk";

/** Short private status links for every applicant in this run, such as /s/Ab3x9K. */
export function useStatusLinks(): { links: Record<string, string>; loading: boolean } {
  const { runId, ws } = useDesk();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const count = ws.applications.length;
  useEffect(() => {
    if (!runId || count === 0) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/run/links", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; links?: Record<string, string> }) => !cancelled && setLinks(j.links ?? {}))
      .catch(() => !cancelled && setLinks({}))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [runId, count]);
  return { links, loading };
}
