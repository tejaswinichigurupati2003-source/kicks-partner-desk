// Starts a run with the practice data on a running copy of the app and prints its link.
// Usage: BASE_URL=http://localhost:3000 node scripts/seed.mjs
// The existing-stores table is filled in automatically the first time the app talks to the database.
const base = process.env.BASE_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/run`, { method: "POST", headers: { "Content-Type": "application/json", "x-actor": "Seed script" }, body: JSON.stringify({ practice: true }) });
const body = await res.json();
if (!body.ok) {
  console.error("Could not create the run:", body.error ?? res.status);
  process.exit(1);
}
console.log(`Run created: ${base}/run/${body.id}`);
