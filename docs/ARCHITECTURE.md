# ARCHITECTURE.md — Kicks Partner Desk

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript (strict)** | One codebase for pages and server routes |
| Styling | **Tailwind CSS** with the tokens from `BRAND.md` | Fast, and we override defaults fully |
| Accessible primitives | **Radix UI** (dialog, tabs, tooltip, popover) | Keyboard and screen-reader support without a default look |
| Spreadsheet reading | **ExcelJS** | Maintained and safe. Do **not** use the `xlsx` npm package (outdated, known issues) |
| Validation | **Zod** | Checks every request and every AI response |
| Database | **Neon Postgres** with **Drizzle ORM** and `@neondatabase/serverless` | Free plan: 0.5 GB, 100 compute-hours a month, sleeps after 5 minutes idle |
| AI | **Gemini API** through `@google/genai`, behind our own `LlmClient` interface | Free key from Google AI Studio |
| Hosting | **Vercel (Hobby)** | Free, public link, no sign-in for visitors |
| Tests | **Vitest** (engine) and **Playwright** (key flows) | |
| Fonts | `next/font` (Big Shoulders Display, Hanken Grotesk, IBM Plex Mono, Noto Sans Kannada, Noto Sans Devanagari) | Served by the app itself |

## 2. Components map

### 2.1 Pages (what people see)

| Page | Route | Purpose | Priority |
|---|---|---|---|
| Overview | `/` | What needs attention today; empty state with "Import applications" | Core |
| Import | `/import` | Bring in applications from a spreadsheet (replace or add), download the template, see file check results; shows the workspace's **application link** to share | Core |
| Become a partner | `/apply/[workspace]` | Public application form with the same questions as the spreadsheet, plus phone and email and a consent tick. New applications join the team's list as "New" and every decision is re-run | Core |
| Applications | `/applications` | Review list: colour-coded, filter by status, area, search | Core |
| Applicant profile | `/applications/[id]` | Decision, reasons, assistant's view, months to earn back, next steps, training, progress, message, change decision | Core |
| Areas | `/areas` | Each territory: openings, who got one, waiting list, alternatives | Core |
| Start here | `/shortlist` | The five to start with, and why | Core |
| Messages | `/messages` | One ready message per applicant, language tabs, copy | Core |
| Insights | `/insights` | Progress from application to opening, area fill, gaps | Core |
| Our stores | `/stores` | The 10 existing stores and their pin codes | Core |
| Ask assistant | drawer on every page | Questions and "what if" | Core |
| Applicant status | `/status/[token]` | Public, private-link page: stage, next step, alternatives, send an update | Core |
| Send an update | part of `/status/[token]` | Applicant submits new information for the team to confirm | Should |
| Change log | `/applications/[id]` tab | Who changed what, when, why | Should |

### 2.2 Interface components

`AppShell` (top bar, bottom bar on phones) · `Wordmark` · `Ticker` · `ShoeboxCard` · `Stamp` (rotated and flat) · `SizeTag` · `LaceProgress` · `StatusPill` · `ScoreBreakdown` · `ReasonList` · `CheckChip` · `DecisionHeader` · `WhatWouldChange` · `AssistantNote` · `EarnBackMeter` · `StageTracker` · `TrainingPlan` · `LaunchCheck` · `AreaCard` · `WaitingList` · `OfferList` · `MessagePreview` (language tabs, copy) · `ChangeDecisionDialog` · `WhatIfResult` (before and after list) · `ChatPanel` · `ImportDropzone` · `FileCheckReport` · `StatTile` · `ProgressBars` · `EmptyState` · `Term` (hover explanation) · `FilterBar` · `DataTable` · `Toast`

### 2.3 Decision engine (`src/engine/`, pure functions, no I/O)

`config` · `readWorkbook` · `normalise` · `checks` · `score` · `matchArea` · `allocate` · `alternatives` · `earnBack` · `readyToOpenPlan` · `trainingPlan` · `launchCheck` · `explain` (template wording) · `messageTemplates` (en/kn/hi) · `rerun` and `diff` · `invariants` (H1, H2)

### 2.4 Assistant layer (`src/ai/`)

`LlmClient` interface · `GeminiClient` · `TemplateClient` (no-AI fallback) · `cache` · tasks: `readApplicantText` · `borderlineView` · `writeExplanation` · `writeMessage` · `planDetails` · `reviewGate` · `batchSummary` · `parseChange` · `chatAgent`

### 2.5 Server routes (`src/app/api/`)

| Route | Does |
|---|---|
| `POST /api/apply/[workspace]` | Saves a form application, re-runs decisions for the workspace, returns a thank-you with the applicant's status link |
| `POST /api/import` | Reads and checks the file, runs the engine, saves, returns the full result |
| `POST /api/batches/[id]/enrich` | Adds assistant wording in small groups; the page upgrades cards as groups arrive |
| `POST /api/whatif` | Parse change, copy, re-run everything, return the before/after list |
| `POST /api/changes` | Save a what-if change as the new current state |
| `POST /api/decisions/[id]/change` | Team changes a decision with a reason |
| `POST /api/chat` | Assistant questions (tool loop) |
| `GET /api/status/[token]` | Data for the applicant status page |
| `POST /api/updates` | Applicant sends new information; goes to the team to confirm |
| `POST /api/stages` | Team updates a stage status |
| `GET /api/template` | Blank import spreadsheet |
| `GET /api/health` | Checks the database; used by the uptime monitor |
| `GET /api/cron/purge` | Deletes data older than 7 days |

### 2.6 Data (Neon)

| Table | Holds |
|---|---|
| `workspaces` | Anonymous workspace per browser |
| `stores` | The 10 existing stores (seeded once, shared) |
| `batches` | One per import: file name, counts, time |
| `territories` | From the import |
| `applications` | From the import (cleaned) plus original row |
| `decisions` | Status, score parts, territory, rank, offers, reasons (JSON), source (engine or team change) |
| `changes` | Team changes with reason, who, when |
| `stages` | Per application, per stage: status, updated time |
| `messages` | Generated text per language |
| `updates` | Applicant-submitted information waiting for the team |
| `events` | Time-stamped log for insights |
| `ai_cache` | AI responses keyed by a hash of the input |
| `status_links` | Random token to application |
| `contacts` | Phone and email from the application form. Never sent to the AI service, never shown in logs |

### 2.7 Flow

```
Spreadsheet → Read & clean → Checks → Score → Match to area → Give openings
   → Decisions + reasons (saved, shown right away)
   → Assistant adds wording and judgement in small groups (shown as it arrives)
   → Team reviews: profile, areas, start-here, messages, insights
   → Team asks questions / enters new information → full re-run → who changed
   → Applicant opens their status link → sends an update → team confirms → re-run
```

## 3. Integrations: what you need and what you don't

| Integration | Need | What it's for | Cost | Notes |
|---|---|---|---|---|
| **GitHub** | Required | Code, and automatic deploys to Vercel | Free | Claude Code works in this repo |
| **Vercel** | Required | Hosting and the public link, plus the daily clean-up job | Free (Hobby) | Add environment variables below |
| **Neon Postgres** | Required | Saving results so status links, changes, stages and insights work | Free plan: 0.5 GB, 100 compute-hours/month, sleeps after 5 minutes idle | Use the **pooled** connection string |
| **Gemini API** | Recommended | Reading messy notes, borderline cases, wording, Kannada/Hindi messages, the assistant | Free key from Google AI Studio; rate-limited; free-tier content may be used by Google to improve its products | **Send no personal data.** Exact model names change often: set them in environment variables and confirm in AI Studio on build day |
| **Uptime monitor** | Recommended | Pings `/api/health` so the link is checked and the database stays awake until judging ends | Free | Use an interval under 5 minutes (Neon sleeps after 5). Turn it off afterwards to save compute-hours |
| ExcelJS, Drizzle, Zod, Radix, Vitest, Playwright | Libraries | See stack | Free | |
| Email (Resend) | Built in, switched off | Send the applicant message and status link by email when `EMAIL_ENABLED=true` | Free tier | Only possible for applications from the form (spreadsheets have no email column). Off by default so no one is emailed by accident |
| WhatsApp Business (Gupshup, Interakt, Twilio) | Later | Send messages and receive replies | Paid | Needs phone numbers, approved templates |
| Sign-in (Auth.js) | Built in, switched off | Staff accounts and roles: Expansion, Finance, Legal, Training. Each role updates its own stages | Free | `AUTH_MODE=open` means anyone with the link gets a private workspace; `AUTH_MODE=login` turns on staff sign-in. Code paths exist for both |
| Maps / Places | Later | Real distance between stores | Paid after free credit | Needs coordinates the data doesn't have |
| India Post pin code lookup | Later | Verify pin codes | Free | The brief limits pins to known prefixes |
| Error tracking (Sentry) | Optional | See crashes | Free tier | Strip personal data |

### Environment variables (Vercel and `.env.local`)

```
DATABASE_URL=            # Neon pooled connection string
GEMINI_API_KEY=          # Google AI Studio key
GEMINI_MODEL=            # a current Flash model id, checked in AI Studio
GEMINI_MODEL_FALLBACK=   # a current Flash-Lite model id
AI_ENABLED=true          # set false to force standard wording everywhere
CRON_SECRET=             # random string; protects /api/cron/purge
APP_URL=                 # public https address, used in status and application links
AUTH_MODE=open           # open | login
EMAIL_ENABLED=false      # true once an email provider key is set
RESEND_API_KEY=          # only if EMAIL_ENABLED=true
```

### Setup order for you
1. Create a GitHub repo and put these five files in it.
2. Create a Neon project; copy the pooled connection string.
3. Create a Gemini key in Google AI Studio.
4. Create a Vercel project from the repo; add the environment variables.
5. Start Claude Code in the repo and give it the kickoff message from `PROMPTS.md`.
6. After the first deploy, open the link in a private window to confirm it opens with no sign-in.
7. Add the uptime monitor on `/api/health`.

## 4. Failure behaviour

| What fails | What people see |
|---|---|
| Gemini slow, rate-limited or off | Standard wording; small note "Standard wording"; everything else normal |
| Neon asleep | First request is a little slower; keep-awake monitor avoids this |
| Neon down | Results from this upload still show; notice "Saving is paused" |
| Bad file | Plain message saying what to fix; nothing partial is shown as final |
| One bad row | That row shows "Needs information"; others continue |
