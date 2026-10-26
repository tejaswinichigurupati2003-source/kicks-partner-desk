# Kicks Partner Desk

A workspace for Kicks's expansion team. Bring in franchise partner applications and the areas to grow in from one Excel file. For every applicant the Desk shows what should happen, why, what they must do next, how they will be trained, a ready message in Kannada, Hindi or English, and a private status page.

## How decisions are made

All decisions come from plain, tested code in `src/engine/`. The rules are in `docs/RULES.md` and the business reasons in `docs/BRAND.md`. Policy numbers (setup costs, score limits, timelines) are in `src/engine/config.ts`.

- One store per pin code and never more approvals than openings in an area. Both are checked on every run.
- Applicant free text is treated as information, never as instructions.
- The assistant (`src/engine/assistant.ts`) answers from stored decisions and previews "what if" changes by re-running everything.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # engine tests
npm run build
```

Environment variables (all optional):

| Name | Use |
|---|---|
| `STATUS_SECRET` | Signs the private applicant status links. Set a long random string in production. |
| `OPENROUTER_API_KEY` | Switches on the AI assistant (Google Gemini models only, through OpenRouter). Without it the assistant uses standard wording. |
| `OPENROUTER_MODEL` | Optional. A model id that starts with `google/`. Default `google/gemini-3.7-flash`. |
| `AI_ENABLED` | Optional. Set `false` to force standard wording. |
| `DATABASE_URL` | Neon Postgres connection string (pooled). When set, each browser's workspace is also saved on the server for 7 days. |
| `CRON_SECRET` | Protects the daily clean-up at `/api/cron/purge`. |
| `LANGSEARCH_API_KEY` | Switches on live market notes on the Market page (web search). |

## Data and teams

Each new visitor gets a private workspace. Changes are saved to Neon within a couple of seconds and kept for 7 days after the last change. The **Share** button in the top bar gives a link; anyone who opens it works in the same workspace, and teammates' changes appear within about 10 seconds. A save made from an out-of-date copy is refused and the latest version is loaded, so nobody overwrites a teammate silently. If the database is unavailable the Desk keeps working and keeps results in the browser.

Uploaded files are read and discarded. Private applicant status pages are signed links that show only that applicant's information as of the day the link was made.

`node scripts/make-fixture.mjs` writes a workbook with messy and competing applications to `fixtures/` for trying the import.
