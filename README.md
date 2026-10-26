# Kicks Partner Desk

A workspace for Kicks's expansion team. Bring in franchise partner applications and the areas to grow in from one Excel file. For every applicant the Desk shows what should happen, why (a step-by-step reason trail), what they must do next, how they will be trained, a dated timeline, a ready message in Kannada, Hindi or English, and a private status page that always shows the latest decision.

Live: https://kicks-partner-desk.vercel.app

## How decisions are made

**The engine decides. The language assistant never does.** All decisions come from plain, tested TypeScript in `src/engine/` (the same input always gives the same output). The assistant (Gemini, through OpenRouter, Google models only) does three jobs:

1. Reads each applicant's free-text business and notes into structured **hints** the engine reads (business background adds at most +3 inside retail experience).
2. Writes plain-English explanations from the stored **reason trail**.
3. Runs the chat tools (explain, compare, update, withdraw, re-run, change an assumption).

With no AI key everything still works: keyword fallbacks read the text and templates write the wording.

Every number the engine uses is an **assumption** (below), shown on the Assumptions page and editable. Saving re-runs everyone and shows who changed.

## Architecture

```
 Excel file ──► POST /api/run ──► read + clean (src/lib/readWorkbook.ts) ──► Data Health report
                                        │
                                        ▼
                         Neon Postgres (runs, applications, territories,
                         existing_stores, decisions, decision_events,
                         chat_messages, status_links)
                                        │
        ┌───────────────────────────────┼─────────────────────────────────┐
        ▼                               ▼                                 ▼
  Browser (Next.js)               POST /api/chat                    /s/<token>
  runs the engine for the         Gemini tool calling:              applicant status page,
  screens; saves changes          get/explain/compare/update/       rebuilt from the run
  with a revision check           withdraw/rerun/set_assumption     every time it opens
        │                               │
        └──────────► src/engine (pure, tested) ◄────────────────────────┘
                     checks → score → rank → allocate → redirect → reason trail
```

- A **run** is one upload with an unguessable UUID. `/run/<uuid>` opens it for anyone with the link, with no sign-in. Runs are deleted after 7 days without changes.
- Saves carry a revision number. A save made from an out-of-date copy is refused and the latest version is loaded, so teammates never overwrite each other silently.
- Every import, chat update, assumption change and manual override writes `decision_events` (before, after, trigger, actor, time) and can be undone.
- Tables are reached only through server routes, using a server-side connection string that is never sent to the browser. The Neon owner connection bypasses row-level security, so this README does not rely on it: access control is the server routes, plus the unguessable run link.

## The rules in short

1. **Needs information:** pin not 6 digits, city and pin disagree, or a required answer is missing.
2. **Not in current plan:** a valid pin that agrees with the city but is in no area, or a city outside the seven.
3. **Money:** at or above the minimum passes. Within the tolerance below it: approved with a condition "show ₹X lakh more". Further below: not eligible. The reason states the % gap.
4. **Minimum score:** below it nobody gets an opening ("overall fit too low"), with the two changes that would add the most points.
5. **Ranking:** applicants with a usable space first, then score → space readiness → investment → completeness → row order. A tie that decides an outcome is written into the trail.
6. **One store per pin code, openings never exceeded** (checked on every run).
7. **Redirected:** an eligible applicant who cannot have their pin (a store is already there, or a higher-ranked applicant won it) is offered the nearest free pin in the area (then the lowest), if an opening is left. No space: redirected. Space in a lost pin: waiting list. Space in a pin that already has a store: redirected, and the next step says "you'll need a space in pin X". Redirects use up an opening, in rank order.

## Assumptions and their defaults

All live in `src/engine/config.ts` (`DEFAULT_ASSUMPTIONS`) and on the **Assumptions** page.

| Assumption | Default |
|---|---|
| Setup cost, ₹ lakh (Tier 1 / 2 / 3) | 35 / 25 / 18 |
| Minimum investment, % of setup cost | 100 |
| Investment tolerance below the minimum, % | 10 |
| Investment cap for points, × setup cost | 1.2 |
| Score weights: investment / space / experience / timeline / area priority / completeness | 25 / 25 / 20 / 10 / 10 / 10 |
| Area priority share (High / Medium / Low) | 100% / 60% / 30% |
| Experience share (0 / 1–2 / 3–5 / 6+ years) | 0% / 40% / 75% / 100% |
| Business background bonus inside experience (max) | +3 points |
| Space share (owned / rented) | 100% / 80% |
| Floor factor (ground, mall / upper / not known) | 1.0 / 0.7 / 0.8 |
| Ideal size / near-ideal range, sq ft | 400–800 / 250–1200 |
| Size factor (ideal / near / other) | 1.0 / 0.8 / 0.5 |
| Minimum score to get an opening | 45 |
| Space-ready applicants placed first | on |
| Stage lengths, weeks: find space / site approval / agreement / fit-out / hiring / training / inventory / soft launch | 9 / 2 / 2 / 4 / 3 / 2 / 2 / 1 |
| Days an opening is held for a condition | 30 |
| Monthly sales, ₹ lakh (Tier 1 / 2 / 3) | 9 / 6 / 4 |
| Take-home share, rented (Tier 1 / 2 / 3) | 15% / 15% / 16% |
| Take-home share, owned (Tier 1 / 2 / 3) | 23% / 23% / 24% |
| Sales spread for the payback range, ± % | 20 |
| Payback target, months | 30 |
| Training days (no experience / 1–2 years / 3+ years) | 14 / 7 / 3 |
| Training hours per day | 6 |
| Nearby-store flag, pin distance | 10 |
| "Start here" bonus (High / Medium / Low) | 5 / 2 / 0 |
| "Start here" list size | 5 |

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

Without `DATABASE_URL` the Desk still opens and works in one tab (changes are kept in this browser only). With it, runs, events and chat are saved.

### Environment variables

| Name | Use |
|---|---|
| `DATABASE_URL` | Neon Postgres pooled connection string. Tables are created on first use. |
| `OPENROUTER_API_KEY` | Switches on the assistant (Gemini, Google models only, via OpenRouter). |
| `OPENROUTER_MODEL` | Optional. A model id starting with `google/`. Default `google/gemini-3.7-flash`. |
| `AI_ENABLED` | Optional. Set `false` to force the keyword fallbacks and template wording. |
| `LANGSEARCH_API_KEY` | Switches on live market notes on the Market page. |
| `CRON_SECRET` | Protects the daily clean-up at `/api/cron/purge`. |

No secrets are stored in the repository. `.env.local` is ignored by git.

### Seed script

```bash
BASE_URL=http://localhost:3000 npm run seed
```

Starts a run with the practice data on a running copy and prints its `/run/<uuid>` link. The fixed ten existing stores are written to the `existing_stores` table automatically the first time the app talks to the database. `npm run make-fixture` rebuilds the practice workbook.

## Judge walkthrough

Open the live site, press **Import → Load practice data**, then open **Ask assistant** (docked panel on desktop, bottom sheet on a phone) and try these seven things.

1. **"Why is APP-005 approved at 32 while APP-003 at 87 is waitlisted?"** — The assistant corrects the premise: APP-005 is *not* approved. Its score is 40.3, below the minimum of 45, and the instruction in its notes was ignored. APP-003 (89.7) is waitlisted because APP-002 (100) won pin 570001 and APP-003 has a space in that pin. A side-by-side comparison of pin availability and score follows.
2. **"APP-002 has withdrawn"** — Saved at once. APP-002 becomes Withdrawn and APP-003 moves up from the waiting list to win 570001. The diff card shows both, with an **Undo** button. The applicant page and the Audit log update immediately.
3. **"APP-012 found a shop"** — The assistant asks one short question (owned or rented, and what size) and saves nothing. Then **"APP-012 found a 450 sq ft ground-floor rented shop"** is saved and the score rises from 60 to about 85. APP-012 stays on the waiting list, because APP-009 holds pin 560010, and the card says so.
4. **"Add one opening to TER-03"** (on a fresh run) — APP-012 gets an outcome: Redirected to pin 560011.
5. **"Why is APP-006 redirected?"** — Kicks already has store ST-06 at pin 570009. TER-02 has free pins 570004 and 570020. 570004 is nearest, so it is offered, and it uses one of the area's two openings.
6. **"Approve APP-005 anyway"** — Declined politely, with a pointer to **Change this decision**, which asks for a reason and is recorded in the Audit log.

7. **"What happens if we raise the minimum score to 60?"** — A *what-if* is never saved. The reply is one line and the card is labelled **Preview, not saved**, listing every decision that would change (for example APP-012 becoming Not eligible). The minimum score stays at 45 and the Audit log gets no entry. Press **Apply this change** to save it; the saved card then has **Undo** and the change is logged.

Also try: **Assumptions** (change the minimum score or the money tolerance, save, and read the diff card), **Areas** (the pin board), and the applicant status link (`/s/…`) on a phone.

## Tests

`npm test` runs Vitest: every engine rule, every acceptance case on the practice data, the parser edge cases (example row, decimal pins, comma-split pins, blank optional fields, free-text language, duplicate IDs), the chat tools and an integration test that imports the practice data, withdraws APP-002 and checks that APP-003 is promoted and `decision_events` records it (runs when `DATABASE_URL` is set). CI runs lint, typecheck, test and build on every pull request; Vercel deploys `main`.
