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

## Data

Nothing is stored on the server. Uploaded files are read and discarded. Results stay in the browser for 7 days. Private status pages are signed, self-contained links that show only that applicant's information as of the day the link was made.

`node scripts/make-fixture.mjs` writes a workbook with messy and competing applications to `fixtures/` for trying the import.
