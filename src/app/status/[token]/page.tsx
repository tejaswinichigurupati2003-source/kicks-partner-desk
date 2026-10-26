import type { Metadata } from "next";
import { readToken } from "@/lib/token";
import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABEL = {
  approved: "Approved to proceed",
  conditional: "Approved with a condition",
  needs_info: "Needs information",
  waiting: "Waiting list",
  not_eligible: "Not eligible right now",
} as const;

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = readToken(decodeURIComponent(token));
  if (!s) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Wordmark size={40} />
        <h1 className="page-title mt-8" style={{ fontSize: 48 }}>
          Link not found
        </h1>
        <p className="mt-3 text-muted">This link isn't valid or has been changed. Please ask your Kicks contact to send it again.</p>
      </main>
    );
  }
  const lang = s.lang === "Kannada" ? "kn" : s.lang === "Hindi" ? "hi" : "en";
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark size={36} />
        <span className="font-display-up text-sm tracking-widest text-muted">Your application</span>
      </div>
      <div className="card p-5" style={{ boxShadow: "4px 4px 0 var(--orange)" }}>
        <p className="mono text-sm text-muted">
          {s.id} · {s.city} · pin {s.pin}
        </p>
        <h1 className="page-title mt-1" style={{ fontSize: 44 }}>
          {s.name || "Your application"}
        </h1>
        <div className="mt-4">
          <span className={`stamp s-${s.status}`}>{LABEL[s.status]}</span>
        </div>
        <p className="mt-5 text-[17px] font-semibold">{s.verdict}</p>
      </div>

      <section className="mt-8">
        <h2 className="font-display-up text-[16px] leading-tight">Your next step</h2>
        <ul className="mt-3 space-y-2">
          {s.next.map((n, i) => (
            <li key={i} className="card p-3 text-[15px]">
              {n}
            </li>
          ))}
        </ul>
      </section>

      {s.stages.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display-up text-[16px] leading-tight">Getting ready to open</h2>
          <ol className="mt-3 space-y-2">
            {s.stages.map((st, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`eyelet mt-1 ${st.status === "Done" ? "eyelet-done" : st.status === "In progress" ? "eyelet-now" : st.status === "Stuck" ? "eyelet-stuck" : ""}`} />
                <span>
                  <strong>{st.name}</strong>
                  <br />
                  <span className="text-sm text-muted">
                    {st.weeks} · {st.owner} · {st.status}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.offers.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display-up text-[16px] leading-tight">Other options</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {s.offers.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Reply to your Kicks contact if you'd like one of these.</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display-up text-[16px] leading-tight">Message from Kicks</h2>
        <div className="prose-msg indic card mt-3 p-4" lang={lang}>
          {s.message}
        </div>
      </section>
      <p className="mt-8 text-sm text-muted">Status as of {s.asOf}. Only your own information is shown here.</p>
    </main>
  );
}
