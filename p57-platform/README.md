# Physique 57 India — Offer Intelligence Workspace

A commercial workspace for conceiving, pricing, evaluating, approving and analysing membership offers.
Bengaluru first (Vittal Mallya Road, Copper + Cloves Indiranagar, Plash Pilates Sadashivnagar), built so
that Mumbai and any future studio is added as data, not as a redesign.

It is deliberately **not** a discount calculator and not a generic CRUD dashboard. Every screen either
helps decide something, or shows why a decision was made.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3210
npm test             # deterministic engine checks — no database, no network, no model provider
npm run build        # production build
npm start            # production server on :3210

npm run data:parse     # re-parse the supplied catalogue export
npm run data:derive    # rebuild the analytics derived from the supplied CSVs
npm run data:validate  # catalogue integrity checks
```

On first request the workspace creates `data/app.db` (SQLite) and seeds itself from the files in
`data/`, so nothing has to be typed in before the workspace is useful. `SEED_VERSION` in
`lib/db/version.ts` governs re-seeding: change it and the workspace reseeds from the files.

### Open workspace mode — read this before exposing it

There is **no sign-in screen**. Anyone who can reach the deployment is treated as the studio director
(Administrator), and can switch member from the account menu in the top-right:

> *No sign-in step: this workspace runs open, and switching only changes whose permissions and
> approvals you see.*

Switching member genuinely changes what you can do — role capabilities are enforced on the server, not
by hiding buttons — but it is **not a security boundary**. Do not expose this build to the public
internet as-is. The session cookie, the capability matrix and `login()` in `lib/auth.ts` are the seams a
real identity provider plugs into later; until one is configured, run this on a private network.

---

## What is real, and what is a labelled stand-in

| Area | Status |
| --- | --- |
| Catalogue, pricing, analytics | **Real** — parsed from the supplied exports; see *Provenance* below |
| Pricing, guardrails, scoring, scenarios | **Real and deterministic** — `lib/engine`, covered by `npm test` |
| Persistence | **Real** — SQLite via `better-sqlite3`; offers, comments, approvals and settings survive restart |
| AI strategist, copy, naming | **Local engine by default** — the deterministic `rules-v1` strategist. Add a provider key in *Settings → AI provider* to route explanations and copy through a model; scores and prices never come from the model either way |
| Momence, CRM, Sheets, marketing automation, n8n | **Not connected.** The workspace says so in *Settings → Integrations*. Analytics come from files; nothing is pushed anywhere automatically |
| Conversion rates, demand forecasts | **Never invented.** A buyer count is an input you supply; every simulation prints the assumptions it ran on |

Anything the business has not supplied stays *unresolved and configurable* rather than guessed: cost
data (so margin is withheld, not estimated), discount ceilings, the price floor, attendance assumptions
and offer conversion rates all live in *Settings*.

---

## Provenance of the numbers

| Source | What it powers |
| --- | --- |
| Momence membership export (88 records) | The catalogue: prices, validity, credits, comps, location scoping, eligibility |
| Payments export (6,274 lines, ₹26,404,316, 2023-11 → 2026-10) | Realised revenue, discount codes, top products |
| CRM lead export (9,892 leads → 3,058 trials → 1,145 sales) | Lead funnel and source performance — described as a funnel, never as an offer conversion rate |
| Customer-base export (2,933 members) | Behaviour: median sessions per month, lapse gaps, revenue per session |
| Capacity export (directional, historical) | Utilisation context, labelled as directional |

Original source rows are preserved. Records that cannot be interpreted honestly — a complimentary
membership, a corporate or partner product, a location-specific package, an implausible price, a row
with impossible dates — are classified *and* flagged for manual review instead of being folded into
retail comparisons. A membership bought at one studio is never assumed redeemable at another.

---

## How the pieces fit

```
lib/engine/        deterministic core — pricing, guardrails, scenarios, cannibalisation, scorecard,
                   naming, copy, recommendations. No database, no network, no model.
lib/data/          persistence reads/writes; offer save, workflow, comments, versions, campaigns
lib/db/            SQLite schema, connection, migrations, derived-file readers, seed
lib/ai/            provider resolution: local strategist engine, or a model when a key exists
app/(app)/*        the workspace screens (command centre, generator, strategist, offer bank, editor,
                   approvals, comparison, campaigns, catalogue, analytics, activity, settings)
app/api/*          server-side endpoints; all permission checks happen here
components/*       the interface: shell, charts, financials, and one module per workspace area
tests/engine.test 37 checks over the calculated behaviour
```

**The rule that holds everywhere:** the engine calculates and validates; AI explains and recommends.
A model never produces a price, a score, a margin or a scenario figure, and no screen lets an AI
estimate borrow the authority of a calculated number.

### Honesty conventions used in the interface

- **Calculated** figures come with their arithmetic (`₹8,300 list less 10% = ₹7,470`).
- **Assumptions** (buyer counts, attendance, displacement) are shown with every result they affect,
  and are editable per run.
- **Estimates** are labelled as estimates. **Recommendations** are labelled as judgement.
- Revenue is never called profit. Contribution margin appears only once real delivery costs exist,
  and states its basis beside the number.
- Unlimited memberships are never treated as a fixed credit count: they are valued per visit against a
  stated attendance assumption, and "per class" is left blank on purpose.
- A benchmark is never set by an entry price: introductory, complimentary, promotional and bundled
  records are excluded from the reference rates an offer is measured against.

---

## Workflow and permissions

`Draft → Submitted for review → (Changes requested) → Approved → Published → Expired / Archived`,
with resubmission and reapproval when commercial terms change on an approved or published offer.
Approval events are written both to the offer's own history and to the activity log.

| Role | Can |
| --- | --- |
| Administrator | Everything, including guardrail overrides, costs, AI provider and team roles |
| Manager | Create, edit, approve, publish, configure guardrails, costs and imports |
| Sales team member | Build and submit offers, comment and mention; cannot approve or publish |
| Viewer | Read, follow and comment only |

Nobody can approve their own submission, and a role cannot be changed by the person holding it.

---

## Keyboard

`⌘K` / `Ctrl-K` command palette · `?` shortcut reference · `G` then `B`/`C` go to the offer bank or the
catalogue · `Esc` closes overlays. Theme is remembered per browser.

## Operational notes

- The engine version is stored in `meta.engine_version`. While the workspace is seeded from files, a
  change to the engine that alters stored figures ships with a `SEED_VERSION` bump (the seeded
  workspace recalculates as a whole). Once pointed at live studio data, recalculation runs from
  *Settings* — saving guardrails recalculates every saved offer — and re-seeding must never be used as
  a recalculation mechanism, because it discards records the studio created.
- Cost data, provider keys and integrations are per-workspace settings, not environment variables,
  so a studio can change them without a deploy. Provider keys are stored server-side and never
  returned to the browser.
