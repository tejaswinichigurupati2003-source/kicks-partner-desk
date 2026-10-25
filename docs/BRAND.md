# BRAND.md — Kicks

Kicks is a footwear retail chain. This file explains **who the brand is, how it makes money and what it needs from a franchise partner**, so every decision the product makes has a business reason behind it. It also defines how the product looks and sounds.

---

## 1. Who Kicks is

- **Name:** Kicks. Short, loud, and what everyone calls a good pair of shoes.
- **What it sells:** sneakers first, then casuals, formals, sandals, sports shoes and school shoes for men, women and children, plus bags and socks. Most pairs cost ₹799 to ₹2,499.
- **Promise:** *Fresh kicks. Fair prices.* The pair you want, in your size, without the markup.
- **Founded:** 2018 in Bengaluru. First store opened in 2019.
- **Today:** 10 stores: 5 in Bengaluru, 2 in Mysuru, and 1 each in Mangaluru, Hubballi-Dharwad and Belagavi.
- **Ambition:** 40 stores across Karnataka by March 2028.
- **Customers:** college students and young professionals who want the latest styles, and families buying for school reopening, festivals and weddings, who prefer service in Kannada, Hindi or English.
- **Average bill:** about ₹1,400.

## 2. Why Kicks grows through franchise partners

Opening 30 more company-run stores would need more capital than the brand wants to commit, and local knowledge it doesn't have in smaller cities. So partners fund and run the store, and Kicks supplies everything that makes it a Kicks store:

| Partner brings | Kicks brings |
|---|---|
| The investment | The brand, store design and signage |
| The shop space | The stock: ranges, sizes and seasonal collections, from the regional warehouse |
| Day-to-day running and local relationships | Billing and stock software |
| A store manager and sales staff who complete training | Training in Kannada, Hindi or English, and ongoing support |

Partners pay a one-time franchise fee (included in the setup cost below) and a royalty on sales (already included in their take-home share below).

**Supply.** Stock goes out from the Bengaluru warehouse, and from the Hubballi-Dharwad warehouse for the north. It travels by truck every two weeks and nothing spoils, so Kicks can serve any town in Karnataka.

## 3. What a store costs and earns (current planning figures)

These are Kicks's current planning figures. Finance reviews them each quarter. They live in one settings file (`src/engine/config.ts`) so they can be updated without touching the logic.

**Setup cost by city size (₹ lakh)**

| | Tier 1 | Tier 2 | Tier 3 |
|---|---:|---:|---:|
| Shop fit-out | 8 | 6 | 4 |
| Racks, counters and billing equipment | 3.5 | 2.5 | 2 |
| Opening stock | 15 | 11 | 8 |
| Franchise fee | 3 | 2.5 | 2 |
| Deposit and licences | 3 | 1.5 | 1 |
| Working capital (first three months) | 2.5 | 1.5 | 1 |
| **Total setup cost** | **35** | **25** | **18** |

**Typical monthly sales:** Tier 1 ₹9 lakh (about 640 bills), Tier 2 ₹6 lakh (about 430 bills), Tier 3 ₹4 lakh (about 290 bills).

**Partner's take-home (after royalty, rent, staff and costs), as a share of sales:**
rented space 15% (16% in Tier 3); owned space 23% (24% in Tier 3). Owned is higher because there is no rent.

**Months to earn back the investment** = setup cost ÷ (monthly sales × take-home share).

| | Tier 1 | Tier 2 | Tier 3 |
|---|---:|---:|---:|
| Rented | about 26 | about 28 | about 28 |
| Owned | about 17 | about 18 | about 19 |

**Target: 30 months or less.** A partner who invests less than the setup cost must borrow the difference, which stretches this. That is why funding is scored and why there is a floor.

## 4. What Kicks looks for in a partner, and why

These are the reasons behind every score. They are shown to the team in plain words.

| What we check | Why Kicks cares | Weight |
|---|---|---:|
| **Investment** vs the setup cost for that city size | Footwear needs a lot of stock on day one, in every size. An under-funded partner opens with thin ranges, loses sales and stalls. The brand accepts a gap of up to 40% (bank loan) but not more. | 25 |
| **Space** (owned, rented, none; floor; size) | Finding and agreeing a space is the biggest cause of delay and rent is the biggest cost. An owned shop earns the partner back about 10 months faster. Footwear needs street presence and room to display ranges and try sizes, so ground floor and mall units do best. Ideal size is 400 to 800 sq ft. | 25 |
| **Retail experience** | Partners who have run shops already handle stock, staff and daily cash. First-timers can succeed, but need longer training and closer support. | 20 |
| **Launch timeline** | Openings are planned around school reopening, Dasara, Diwali and the wedding season. A partner with no space who wants to open in two months will be disappointed. Honest expectations early prevent drop-outs. | 10 |
| **Business background** | Running a footwear, clothing, bag or general shop shortens training and speeds up the first weeks. | 10 |
| **Complete, consistent application** | Every missing or contradictory answer costs the team a follow-up. Clear applications are also a sign of a serious partner. | 10 |

**One store per pin code.** Two Kicks stores in the same pin code would split the same customers, so the brand never does it. Stores in nearby pin codes in the same city are flagged as "may take customers from our nearby store" for the team to look at.

**City size and priority.** Tier 1 is Bengaluru, Tier 2 is Mysuru, Mangaluru, Hubballi-Dharwad and Belagavi, and Tier 3 is Tumakuru and Davanagere. Priority comes from the team. High means the brand wants a store there now, typically because the area is under-served.

**Checks before signing.** A Kicks store carries the brand's name and handles customers' money and a large stock. So every partner goes through a site visit, financial verification, a police verification certificate, a credit check, and property checks. Shop registration, trade licence and GST are applied for before opening. The legal team confirms the current requirements for each city.

## 5. The product

Two surfaces, one brand:

- **Kicks Partner Desk** — the expansion team's workspace: bring in applications, see recommended decisions with reasons, manage areas, send messages, track getting ready to open.
- **Partner status page** — a private link each applicant receives. It shows where they are, what to do next, and lets them send updates.

---

## 6. Voice and copy

**Sound like:** a confident, upbeat colleague. Direct and plain. **The fun lives in the look, never in confusing words.** A clear label always beats a clever one. Short sentences. A little warmth is fine (a friendly greeting in the applicant's language), never forced.

**Rules**
1. Plain English, reading level of a school student. A person seeing the screen for the first time should know what it is and what to do next.
2. Say what happened and what to do: "3 applications need a reply from the applicant."
3. Use numbers with units and a comparison: "₹18 lakh invested vs ₹25 lakh needed."
4. Every screen's title says what is on it. Every empty screen says what to do.
5. Never show internal codes (rule IDs, enum names), raw JSON or error stacks.
6. **Never use these words anywhere in the interface, messages or anything users can read:** assignment, hackathon, judge, test, demo, MVP, sample, dummy, mock, prototype, case study, lorem, placeholder, TODO.
7. The product is called **Kicks Partner Desk**. Don't mention the tools used to build it in the interface.
8. Kannada and Hindi messages must read like a person wrote them. No machine-translation stiffness. Keep names, pin codes and ₹ amounts unchanged.

**Plain words to use**

| Don't write | Write |
|---|---|
| Slots | Openings |
| Hold | Needs information |
| Waitlist | Waiting list |
| Reject | Not eligible right now |
| Proceed | Approved to proceed |
| Conditional | Approved with a condition |
| Cannibalisation | May take customers from our nearby store |
| Catchment | Area the store serves |
| Payback | Months to earn back the investment |
| Pipeline / funnel | Progress from application to opening |
| Trace / flags | Reasons / things to check |
| Override | Change this decision |
| Territory ID | Area (TER-01) |
| Due diligence | Checks before we sign |
| Onboarding | Getting ready to open |

Status names on screen: **Approved to proceed**, **Approved with a condition**, **Needs information**, **Waiting list**, **Not eligible right now**.

---

## 7. Visual design

### Feel
Sneaker culture, not corporate admin. Think a fresh shoebox on a shop counter: bold, high-contrast, a little loud, and confident. The product should look like it belongs to a brand people actually like, and nothing in it should look like a default dashboard template. **Loud chrome, calm data:** headings, stamps, navigation and cards get the personality; tables and forms stay quiet and easy to read so the team can work all day.

### Colour (CSS variables)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#111111` | Text, strong borders, navigation, buttons |
| `--box` | `#F3EFE6` | Page background (cardboard shoebox cream) |
| `--surface` | `#FFFDF8` | Cards and tables |
| `--orange` | `#FF4B1F` | Brand colour: logo slash, hard shadows, highlights, big numbers. Never for small text |
| `--lime` | `#D4FF3A` | Highlight: selected items, "new" tags, hover marks, the shortlist. Always with `--ink` text |
| `--cobalt` | `#2B4BFF` | Links, focus ring, secondary actions |
| `--soft-line` | `#D9D2C3` | Quiet dividers inside tables |
| `--muted` | `#5F5B52` | Secondary text (contrast checked on `--box`) |
| `--error` | `#B3001B` | Errors; always shown with a "!" icon and words |

Status stamps (always a word and a shape, never colour alone):

| Status | Text | Background |
|---|---|---|
| Approved to proceed | `#0E6B43` | `#D5F3E1` |
| Approved with a condition | `#7A4A00` | `#FFE39A` |
| Needs information | `#47433B` | `#E6E0D2` |
| Waiting list | `#2B4BFF` | `#E1E6FF` |
| Not eligible right now | `#B3001B` | `#FFD9D3` |

All text meets WCAG AA contrast. Do not put orange text on light backgrounds.

### Typography
**Do not use** Inter, Roboto, Arial, Helvetica, Open Sans, Poppins, Montserrat, DM Sans, Space Grotesk, Manrope, Plus Jakarta Sans, Geist, or the system font stack as the main face.

| Role | Font | Notes |
|---|---|---|
| Titles, big numbers, stamps, navigation | **Big Shoulders Display** (800 and 900) | Tall, condensed, poster-like. Upper case for titles and stamps. Never for sentences or long text |
| Interface and body text | **Hanken Grotesk** | Clean and readable at small sizes |
| IDs, scores, tables of numbers | **IBM Plex Mono** | Aligned digits |
| Kannada text | **Noto Sans Kannada** | Used automatically for Kannada characters; use bold weight for titles |
| Hindi text | **Noto Sans Devanagari** | Used automatically for Hindi characters; use bold weight for titles |

Load all through `next/font` so they are served from the app itself. Scale: 13 / 15 / 17 / 24 / 36 / 56 / 88 px. Body 15px, line height 1.55. Page titles 56px upper case with tight line height 0.95. Kannada and Hindi text use line height 1.7.

### Shape and layout: the shoebox look
- **Cards are shoebox lids:** 2px `--ink` border, 6px radius, and a hard offset shadow (`4px 4px 0 var(--ink)`, no blur). On hover the card moves 2px up-left and the shadow grows to 6px. The selected card gets a `--lime` strip across the top.
- **Navigation:** a top bar in `--ink` with the logo on the left, tabs in Big Shoulders Display upper case, and the active tab underlined with a thick `--lime` bar. On narrow screens it becomes a bottom bar. No left sidebar.
- **Page headers:** huge upper-case title, a one-line explanation under it, and the main action as a black button with an orange hard shadow.
- **Status stamps:** rotated about -3 degrees, upper case, 2px border, like a rubber stamp on a box. Tables use a flat, unrotated version of the same stamp so rows stay easy to scan.
- **Size tags:** the score appears as a hang-tag with a punched hole: "SCORE 78" on a small tag.
- **Lace progress:** getting-ready-to-open is shown as a shoelace running through eyelets. Each stage is an eyelet; finished stages are laced in `--orange`, the current one pulses, unfinished ones are empty.
- **The shortlist ("Start here")** is styled like a release list: numbers 1 to 5 in huge type, lime highlights.
- **Overview ticker:** a slow scrolling strip under the header with live facts ("3 NEED INFORMATION · 2 NEW APPLICATIONS · BENGALURU IS FULL"). Pauses on hover and stops entirely when the user prefers reduced motion.
- **Diagonal motif:** a 12-degree "kick line" slash is used as a section divider and behind the logo.
- **Tables:** 44px rows, sticky header with an `--ink` bottom border, `--soft-line` row dividers, no boxes around cells, status stamp in the first visible column. Keep these calm.
- **Empty states:** a big line drawing of a shoebox with the lid off and one clear next action.
- **Motion:** 150–200ms ease-out; numbers count up once; stamps "land" with a small drop and settle when a decision first appears; laces draw in when a profile opens. Respect `prefers-reduced-motion` by turning all of this off.

### Logo
Wordmark **KICKS** in Big Shoulders Display Black, upper case, skewed 8 degrees, in `--ink` (white on the dark top bar), with a `--orange` kick line slashing up behind the "K". Provide as inline SVG. Favicon: the "K" with the slash on `--orange`.

### Avoid
Purple or blue-to-purple gradients, glass effects, soft drop shadows, emoji as icons, shoe clip-art or stock sneaker photos, generic grids of icon cards, default component-library styling, stock "AI sparkle" icons, and a sidebar-plus-white-cards admin look.

### Accessibility and devices
Keyboard reachable everywhere, visible focus ring (3px `--cobalt` with a 2px gap), status never by colour alone, tap targets at least 44px, rotated stamps never carry the only copy of important text, works at 360px width (the status page is mobile-first; the Desk is desktop-first but usable on a tablet).
