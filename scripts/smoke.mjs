// Quick live check: health, a fresh practice run, a chat what-if that must not save, a withdrawal that must save, and the public pages.
const B = process.env.LIVE_URL || "https://kicks-partner-desk.vercel.app";
const out = [];
const check = (name, ok, extra = "") => out.push({ name, ok: !!ok, extra });
const t0 = Date.now();
try {
  const h = await fetch(B + "/api/health").then((r) => r.json());
  check("health", h.ok && h.saving === "on", JSON.stringify(h));
  const r = await fetch(B + "/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ practice: true }) });
  const ck = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const made = await r.json();
  check("practice import", made.ok && /^[0-9a-f-]{36}$/.test(made.id || ""), made.id);
  const call = (path, init = {}) => fetch(B + path, { ...init, headers: { "content-type": "application/json", cookie: ck, ...(init.headers || {}) } });
  const chat = async (m) => (await call("/api/chat", { method: "POST", body: JSON.stringify({ message: m }) })).json();
  const whatIf = await chat("What happens if we raise the minimum score to 60?");
  check("what-if previews, saves nothing", whatIf.ok && whatIf.saved === false && whatIf.reply?.cards?.[0]?.preview === true, whatIf.reply?.text?.slice(0, 80));
  const wd = await chat("APP-002 has withdrawn");
  check("withdrawal saves with undo card", wd.ok && wd.saved === true && wd.reply?.cards?.[0]?.undoable === true, wd.reply?.text?.slice(0, 80));
  const run = await (await call("/api/run")).json();
  check("saved state", run.ok && run.data?.applications?.length === 24 && run.data.applications.find((a) => a.id === "APP-002")?.withdrawn === true);
  const hist = await (await call("/api/run/history")).json();
  check("run history", hist.ok && hist.runs?.length > 0);
  for (const p of ["/", "/applications", "/data-review", "/assumptions", "/audit", "/runs"]) {
    const s = (await call(p)).status;
    check("page " + p, s === 200, String(s));
  }
  const links = (await (await call("/api/run/links")).json()).links || {};
  const first = Object.values(links)[0];
  check("status link", first && (await fetch(first)).status === 200, first || "no link");
} catch (e) {
  check("exception", false, String(e));
}
const failed = out.filter((c) => !c.ok);
console.log(JSON.stringify({ at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), passed: out.length - failed.length, failed: failed.length, checks: out }, null, 1));
process.exit(failed.length ? 1 : 0);
