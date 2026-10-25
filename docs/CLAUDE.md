# CLAUDE.md — Build brief: Kicks Partner Desk

You are building a real internal product for **Kicks**, a footwear retail chain in Karnataka that is growing through franchise partners. Build it as if it will be used by the expansion team on Monday.

## What it does

The expansion team imports partner applications (a spreadsheet) and the areas they want to grow in. For **every** application the product shows:
1. what should happen to that partner and why,
2. for partners who move forward: what they must do next and how they will be trained to run the store,
3. a ready message to the applicant in Kannada, Hindi or English, and a private status page for them.

The team can ask the assistant questions ("Why is APP-007 on the waiting list?") and give new information ("APP-012 found a ground-floor shop"); the product re-runs everything and shows who changed and why.

## Files (read in this order)

| File | Read it for |
|---|---|
| `BRAND.md` | Who Kicks is, why each rule exists, voice, **banned words**, visual design and fonts |
| `RULES.md` | The decision engine: checks, score, openings, onboarding, privacy |
| `ARCHITECTURE.md` | Stack, pages, components, data, routes, integrations, environment variables |
| `PROMPTS.md` | The assistant's tasks and prompts, and the fallback |

## Rules that outrank everything else

1. **This is a real product, not a prototype.** No hard-coded or fake data, no fake loading spinners, no buttons that do nothing: every visible control works or isn't shown. Nothing in the interface refers to how it was made or who it was made for. It must look and read like software Kicks's team pays for. Never write the words assignment, hackathon, judge, test, demo, MVP, sample, dummy, mock, prototype, case study, lorem, placeholder or TODO in anything a user can see (screens, messages, file names users download, page titles, error text, metadata). No "powered by" notes about build tools.
2. **Plain language everywhere.** A new user must understand every screen without help. Use the word list in `BRAND.md` section 6. Never show internal codes, raw JSON, stack traces or rule IDs. Every screen has a clear title and one obvious next action; every empty state says what to do.
3. **Decisions come from code (`src/engine`), not from the AI.** The assistant explains and words. If the assistant fails, standard wording is used and nothing breaks.
4. **H1 and H2 in `RULES.md` are checked on every run.** One store per pin code; openings never exceeded.
5. **No sign-in in this release (`AUTH_MODE=open`).** Anyone with the link gets a private workspace; no data crosses workspaces. Build the staff sign-in and roles as well (`AUTH_MODE=login`), switched off by default, so turning it on later needs no rewrite.
6. **No personal data goes to the AI service.**
7. **Follow `BRAND.md` section 7 for design, and do not make it boring.** The look is bold sneaker culture: shoebox-style cards with hard shadows, stamps, size tags, lace progress, a top bar with a lime underline, huge upper-case titles. It must not look like a default admin template or component-library demo. Keep tables and forms calm and readable. Use the specified fonts and colours. Do not use Inter, Roboto, Arial, Open Sans, Poppins, Montserrat, DM Sans, Space Grotesk, Manrope, Geist or the system font stack as the main face. No purple gradients, glass effects, soft blurry shadows or emoji icons. Fun lives in the look, never in confusing words.
8. **Never invent data in the interface.** The product ships with no applications. It does ship with Kicks's 10 existing stores (see `RULES.md` section 2).

## Build order

Work one phase at a time. At the end of each phase: run the checks, show the results, and wait for "continue".

**Phase 0 — Setup.** Next.js, TypeScript strict, Tailwind with tokens from `BRAND.md`, the design primitives (shoebox card, stamp, size tag, lace progress, ticker, top bar), fonts via `next/font`, Drizzle + Neon, Vitest, Playwright, lint. Env var check at start-up with a clear message. Seed the 10 stores. `GET /api/health`. *Check:* app boots; fonts render including Kannada and Hindi sample text in dev; database reachable.

**Phase 1 — Engine.** Everything in `src/engine/`: reading and cleaning the workbook, checks, score, matching, openings, alternatives, months-to-earn-back, getting-ready plan, training plan, launch check, standard explanation wording, message templates (en, kn, hi), re-run and diff, invariants. *Check:* unit tests for every case in `RULES.md` section 11; the stress file (50 applicants on 3 pins) passes H1 and H2; same file twice gives identical output.

**Phase 2 — Applications in, decisions out.** `/import` (dropzone, replace or add, template download, file check report, the workspace's application link), `/apply/[workspace]` (public form, thank-you page with the applicant's status link), `POST /api/import`, `POST /api/apply/[workspace]`, saving, `/applications` (colour-coded list with filters and search), `/applications/[id]` (decision, reasons, what would change this, score parts, months to earn back, next steps, training, launch check, stage tracker, message), `/areas`, `/shortlist`, `/stores`, Overview. *Check:* Playwright: upload a workbook, every application shows a status, a reason, and (if approved) next steps and training; no banned words appear anywhere (add a test that scans rendered pages and message templates).

**Phase 3 — Assistant.** `LlmClient`, `GeminiClient`, `TemplateClient`, cache, tasks A1 to A9, group-wise enrichment so cards upgrade as results arrive, assistant drawer, what-if with full re-run and before/after list, "Save this change", "Change this decision" with a reason, change log. *Check:* assistant on and off both work; a what-if that moves a waiting-list applicant up shows everyone affected; an instruction-like note is ignored and reported; "approve APP-xxx anyway" is declined politely.

**Phase 4 — Messages, status page, insights.** `/messages` (language tabs, copy), `/status/[token]` (mobile-first: stage, next step, alternatives, send an update), updates going to the team to confirm, stage updates, `/insights` (progress from application to opening, area fill, waiting-list depth, areas with fewer applicants than openings). Where data doesn't exist yet (time per stage, weekly users), show "Starts filling in as the team uses the Desk". *Check:* the status link opens with no sign-in on a phone-width window and shows only that applicant's information.

**Phase 5 — Hardening and polish.** Security headers, rate limits, file-type checks, escaping, export neutralisation, 7-day clean-up job, graceful failure paths from `ARCHITECTURE.md` section 4, empty/loading/error states, keyboard and contrast pass, responsive pass, favicon and page titles ("Kicks Partner Desk"). *Check:* turn off the AI key and the database one at a time: the app still works as described; open in a private window; run Lighthouse accessibility.

**Phase 6 — Release.** Deploy to Vercel, add environment variables, confirm the public link opens with no sign-in, add the uptime monitor on `/api/health`, write a short `README.md` (setup, env vars, how to run tests). *Check:* full flow on the deployed link on a phone and a laptop.

## Conventions

- TypeScript strict. No `any` without a comment. Engine functions are pure and have tests.
- All business numbers in `src/engine/config.ts`.
- Validate every request body and every AI response with Zod.
- Escape applicant text. Never use `dangerouslySetInnerHTML` with it.
- Commit after each phase with a clear message.
- Keep secrets out of the repo. Never log personal data.
- Dev-only scripts and fixtures live under `scripts/` and `fixtures/`; the interface never mentions them.

## Definition of done

- [ ] Every application, from any valid workbook, shows a status and a plain reason.
- [ ] Every approved application shows next steps with owners and time windows, a training plan in its language, and a launch check.
- [ ] No two approved applications share a pin; no area exceeds its openings; verified by tests.
- [ ] "Why is APP-xxx …?" and "What if …" work, with the assistant on and off.
- [ ] Banned-words test passes on all pages and templates.
- [ ] Opens with no sign-in; works on a phone.
- [ ] Looks like Kicks: bold, distinctive, right fonts and colours, plain wording, readable tables.
