import type { Metadata } from "next";
import { Wordmark } from "@/components/ui";
import { dbEnabled, loadRun, resolveToken } from "@/lib/runs";
import { mergeAssumptions } from "@/engine/config";
import { buildMessage } from "@/engine/messages";
import { buildTimeline } from "@/engine/plans";
import { run, STATUS_LABEL } from "@/engine/run";
import { toRunInput } from "@/lib/workspace";

export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <Wordmark size={40} />
      <h1 className="page-title mt-8">Link not found</h1>
      <p className="mt-3 text-muted">This link isn't valid, or it has expired. Please ask your Kicks contact to send it again.</p>
    </main>
  );
}

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!dbEnabled() || !/^[A-Za-z0-9]{4,12}$/.test(token)) return <NotFound />;
  const found = await resolveToken(token).catch(() => null);
  if (!found) return <NotFound />;
  const stored = await loadRun(found.runId).catch(() => null);
  const app = stored?.data.applications.find((a) => a.id === found.applicationId);
  if (!stored || !app) return <NotFound />;

  const asm = mergeAssumptions(stored.data.assumptions);
  const result = run(toRunInput(stored.data));
  const d = result.decisions[app.id];
  if (!d) return <NotFound />;
  const now = new Date();
  const holds = d.status === "approved" || d.status === "conditional" || d.status === "redirected";
  const timeline = holds ? buildTimeline(app, d, now, asm) : null;
  const stageState = (key: string) => stored.data.stages[app.id]?.[key] ?? "Not started";
  const message = buildMessage(app, d, app.language, { now, link: "", assumptions: asm }).replace(/\n[^\n]*$/, "");
  const lang = app.language === "Kannada" ? "kn" : app.language === "Hindi" ? "hi" : "en";

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark size={36} />
        <span className="text-sm font-bold tracking-wide text-muted">Your application</span>
      </div>
      <div className={`card p-5 tint-${d.status}`}>
        <p className="mono text-sm text-muted">
          {app.id} · {app.city} · pin {app.pin}
        </p>
        <h1 className="page-title mt-1">{app.name || "Your application"}</h1>
        <div className="mt-4">
          <span className={`stamp s-${d.status}`}>{STATUS_LABEL[d.status]}</span>
        </div>
        <p className="mt-4 text-[17px] font-semibold">{d.nextStep}</p>
        {d.status === "redirected" && d.redirectPin && <p className="mt-2 text-sm">Offered pin code: <strong className="mono">{d.redirectPin}</strong></p>}
        {d.status === "waiting" && d.position && <p className="mt-2 text-sm">Your place on the waiting list: <strong>{d.position}</strong></p>}
      </div>

      {d.condition.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display-up text-[18px] leading-tight">What we need from you</h2>
          <ul className="mt-3 space-y-2">
            {d.condition.map((c, i) => (
              <li key={i} className="card p-3">
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {timeline && (
        <section className="mt-8">
          <h2 className="font-display-up text-[18px] leading-tight">Getting ready to open</h2>
          <p className={`mt-2 text-sm ${timeline.tooEarly ? "font-semibold text-danger" : "text-muted"}`}>
            {timeline.tooEarly && <span aria-hidden="true">! </span>}
            {timeline.text}
          </p>
          <ol className="mt-3 space-y-2">
            {timeline.stages.map((st) => {
              const status = stageState(st.key);
              return (
                <li key={st.key} className="flex items-start gap-3">
                  <span className={`eyelet mt-1 ${status === "Done" ? "eyelet-done" : status === "In progress" ? "eyelet-now" : status === "Stuck" ? "eyelet-stuck" : ""}`} />
                  <span>
                    <strong>{st.name}</strong>
                    <br />
                    <span className="text-sm text-muted">
                      {day(st.start)} to {day(st.end)} · {st.owner} · {status}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {d.status === "waiting" && d.offers.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display-up text-[18px] leading-tight">Other options</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {d.offers.slice(0, 3).map((o) => (
              <li key={o.territoryId}>
                {o.city}: pin codes {o.pins.join(", ")} ({o.openingsLeft} opening{o.openingsLeft === 1 ? "" : "s"} left)
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Reply to your Kicks contact if you'd like one of these.</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display-up text-[18px] leading-tight">Message from Kicks</h2>
        <div className="prose-msg indic card mt-3 p-4" lang={lang}>
          {message}
        </div>
      </section>
      <p className="mt-8 text-sm text-muted">Updated {now.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. This page shows only your own information and always reflects the latest decision.</p>
    </main>
  );
}
