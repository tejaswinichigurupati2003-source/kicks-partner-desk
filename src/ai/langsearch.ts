import "server-only";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
}

export function searchEnabled(): boolean {
  return !!process.env.LANGSEARCH_API_KEY;
}

/** Web search through LangSearch. Returns an empty list on any failure. */
export async function webSearch(query: string, count = 5): Promise<WebHit[]> {
  if (!searchEnabled()) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.langsearch.com/v1/web-search", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.LANGSEARCH_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, count, freshness: "oneYear" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: { webPages?: { value?: { name?: string; url?: string; snippet?: string; text?: string; datePublished?: string | null }[] } } };
      return (json.data?.webPages?.value ?? [])
        .filter((v) => v.url && v.name)
        .map((v) => ({ title: String(v.name).slice(0, 160), url: String(v.url), snippet: String(v.snippet ?? v.text ?? "").slice(0, 500), date: v.datePublished ?? null }));
    } catch {
      /* retry once, then give up quietly */
    }
  }
  return [];
}
