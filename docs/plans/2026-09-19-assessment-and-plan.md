# Persuaider — State, Market, Rebuild Decision, Product Plan, Engineering Plan

Date: 2026-09-19. Grounded in the code at HEAD `a159906` (2026-06-01), the codegraph index
(1,668 nodes / 4,821 edges), the plan store in `.plan/state.db`, and four research passes
(auth diagnosis, codebase map, competitor research, stack research). Every number below was
measured or cited; single-source market figures are flagged.

Vision being planned for:

1. Users create full negotiation scenarios and practice against AI personas, with feedback.
2. Agent-only simulations explore many paths and surface the best responses.
3. A user steps into any point of a simulation, plays the turn, and is graded against the
   simulation's best continuation.

---

## 1. Where are we

### Shipped and working (capability 1)

One month of work (2026-05-01 to 2026-06-01, 15 commits) produced a complete human-vs-AI
trainer:

| Area | State | Where |
|---|---|---|
| Auth | Clerk, migrated from NextAuth; broken developer path (see §2) | `src/middleware.ts`, `src/lib/auth/clerk.ts` |
| Authoring | 5-step admin wizard, weighted frameworks, win conditions, tags | `src/components/admin/ScenarioTable.tsx` |
| AI generation | From prompt or uploaded document; modal built but never mounted | `src/lib/llm/generation.ts`, `src/components/scenarios/GenerateScenarioModal.tsx` |
| Practice loop | Streaming chat, mood indicator, LLM evaluation, PDF export | `src/app/api/conversations/[id]/messages/stream/route.ts`, `src/lib/llm/evaluation.ts` |
| Marketplace | Explore, search, tags, fork, join-by-code | `src/app/(user)/explore/` |
| Admin | Users, analytics, conversation review, roles API (no UI) | `src/app/(admin)/` |
| LLM | Claude → Gemini → OpenAI chain with retry and error classification | `src/lib/llm/providers/chain.ts` |
| Tests | 81 Jest files, 1,246 cases, 18.6k test LOC vs 12.9k source LOC; 68% of test files mock; 15 Playwright e2e; a dead Selenium suite | `src/**/__tests__`, `e2e/` |

### Not built (capabilities 2 and 3)

No simulation, rollout, tree, branch, replay, or takeover code exists anywhere in `src/`.
The plan store's own note says "0%. No code exists anywhere." Capability 3 is not even
specified in the 38-task plan.

### Since June 1

Nothing shipped. The only work is the untracked planning harness `scripts/plan.mjs` and
`.plan/state.db`: 8 phases, 38 tasks, 0 started, all 38 verifications read `todo`.

### Half-finished surfaces (grounded)

- `POST /api/scenarios` hardcodes `evaluationCriteria: '{}'` (`src/app/api/scenarios/route.ts:40`), so learner-created scenarios cannot be scored.
- `Role` model and its confidential briefs are never read by `buildPersonaPrompt` (`src/lib/llm/prompts.ts:43-49`).
- `GenerateScenarioModal` is imported by nothing except its test.
- `reattempt` API has no caller. `personas/status` has no caller. Admin roles API has no UI.
- `winCondition` and `contextNotes` are validated and stored, never enforced or injected.
- Persona prompt caps replies at 2–4 sentences and has no hidden target or walk-away point; the opponent folds under pressure.
- Uploads write to `public/uploads/`, which does not survive a Vercel deploy.
- Dead schema: `passwordHash`, `provider`, `PasswordResetToken`, `EmailVerificationToken`, `Persona.strategyMemory`, `Scenario.sourceDocument`.

---

## 2. Why auth is "impossible"

The Clerk code in `src/` is essentially correct. The developer path around it is broken in
nine places, ordered by severity:

| # | Problem | Location | Fix |
|---|---|---|---|
| S1 | `make dev` requires `ensure-auth`, which installs the Vercel CLI globally, forces `vercel login` + `vercel link`, blocks on a manual dashboard step, and exits 1 without keys. No bypass. | `Makefile:70-124`, `:267` | Remove `ensure-auth` from `dev`; rely on Clerk keyless mode |
| S2 | Admin is unreachable. Middleware trusts only Clerk `publicMetadata.role`; layout and API trust the DB `role` column. Nothing ever writes `publicMetadata.role = 'admin'`. Seeded admin bounces off `/admin` forever. | `src/middleware.ts:25-36` vs `src/lib/auth/clerk.ts:32` | Middleware resolves role via the same path as everything else; add `make promote-admin EMAIL=` |
| S3 | Every auth failure is swallowed into `return null` with no log. A valid Clerk session with no Prisma row looks "logged out". | `src/lib/auth/clerk.ts:27,36-38` | Log; auto-provision the Prisma row on first sight |
| S4 | Clerk→Prisma sync only happens via webhook; `CLERK_WEBHOOK_SECRET` is in no env file, so local signup never creates a DB user. Only Playwright's global-setup papers over it. | `src/app/api/webhooks/clerk/route.ts:20`, `e2e/playwright/global-setup.ts:72-90` | Lazy upsert in `getAuthSession()`; webhook becomes a prod optimization |
| S5 | `.env.example` has zero Clerk vars and still lists NextAuth and `ADMIN_USERNAME/PASSWORD`. Makefile writes a SQLite URL into a Postgres schema, and `GEMINI_API_KEY` where code reads `GOOGLE_GEMINI_API_KEY`. | `.env.example`, `Makefile:42-57` | Rewrite both to the five real variables |
| S6 | Key parse requires double quotes; unquoted key loops you into the Vercel ritual forever. | `Makefile:71` | Tolerant parse |
| S7 | README documents the dead admin login and tells you to `make db-reset` on login failure, which destroys `clerkId` links. | `README.md:46,234` | Rewrite |
| S8 | NextAuth debris: jest transform patterns, dead schema columns, orphaned validators, Selenium login test asserting deleted form fields, smoke test asserting a credentials provider. | `jest.config.mjs:21-24`, `e2e/tests/login.test.ts`, `e2e/smoke/production.ts` | Delete |
| S9 | `make test` runs a health check that makes live paid LLM calls and creates users in the shared Clerk tenant before any unit test runs. | `Makefile:285`, `e2e/playwright/health-check.ts` | `test` = unit; network gate only under `test-e2e` |

Typecheck and lint are clean. That is why it hurts: every failure is a runtime redirect or a
silent null. 2,205 lines of auth unit tests mock Clerk and would not catch S2.

Four edits (S1, S2, S3, S4) make
`git clone && make dev && sign up` work with no Vercel account.

---

## 3. Is this competitive

### Landscape (September 2026)

- **Capability 1 is commoditized.** ~25 products do persona roleplay with rubric scoring. Yoodli ($60M raised; $8–20/mo individual), Hyperbound (YC, $18M, voice bots), Second Nature ($22M Series B), Exec ($20–39/seat, transparent), Synthesia Roleplay Sessions ($25/seat, 50k-company distribution), Deal/Spar (June 2026, pure negotiation, from a 2009 training firm), and consumer apps at $9.99/mo (NegotiateAI, Selectic). ChatGPT voice mode is the free ceiling; 56% of Gen Z already rehearse hard conversations with AI.
- **Capability 2 is rare in product, proven only in research.** No competitor ships agent-only exploration of many paths. Tree search over dialogue works in papers (GDP-Zero, DPDP, feedback-aware MCTS, Dialogue Action Tokens), on PersuasionForGood/Sotopia, never productized for training.
- **Capability 3 is unique and unproven.** Nobody does takeover at a node, fork-and-compare, or grading against a searched baseline. The nearest is NegotiateAI's single "what you could have said."
- **Enterprise procurement tools** have begun marketing pre-meeting scenario forecasting. "First to individuals", not "first ever", is the honest claim.

### The trap the research exposes

Three 2025–26 papers (Salesforce "Counterparty Modeling is Not Strategy", "LLM Rationalis?",
NegotiationArena) show prompted frontier LLMs are weak, exploitable negotiators: they anchor
at extremes, ignore leverage, and their bargaining does not improve with better models. A
separate line ("LLM-based Human Simulations Have Not Yet Been Reliable") shows LLM human
simulations diverge from real behavior. Also, in one 2026 study agent-vs-agent negotiation
without a structured deal-state ledger failed to reach agreement in 314 of 315 configurations.

**Implication:** a naive simulation finds "best responses" against a pushover. The moat is not
the tree search; it is counterpart fidelity plus utility-grounded scoring. Without those, the
forecast is a credibility liability.

### What users complain about (secondary sources; G2/Reddit blocked)

Robotic personas that fold; keyword-rigid scoring that cannot say what to change; manual
authoring at scale; opaque pricing with 5–200 seat minimums; no link between practice and
outcomes.

### Where a small team wins

1. The strategy layer: searched trees, counterfactual replay, fork-and-compare.
2. Authoring depth: worlds with private information, reservation values, multi-issue utilities.
3. Transparent self-serve pricing.
4. A specific wedge.

### Ten differentiated ideas (from research, ranked by fit to the vision)

1. Fork-and-compare replay after every session, with utility delta per turn.
2. Take-over-at-any-node graded against the searched best continuation from the same state.
3. Utility-grounded worlds: issues, weights, reservation values, BATNAs, private info; score Pareto efficiency and surplus split, not keywords.
4. "Prep for my real negotiation": paste context, build a counterpart twin, run N overnight sims, get a brief, rehearse the top path.
5. Impasse explorer: cluster the branches that ended in no-deal and drill the turns before failure.
6. Expert-principle persona authoring: author corrects a bad turn, system distills a rule, rule is regression-tested.
7. A counterpart actually trained to bargain (RLVR/self-play hard mode) with published exploitability tests.
8. Multi-party and back-table simulations (buyer, buyer's CFO, your manager).
9. Instructor mode: upload a confidential-instructions case, auto-generate both AI sides, produce the outcome tables and Pareto plots instructors hand-build today.
10. Per-simulation pricing and an open, versionable scenario format.

### Wedge options

| ICP | Pros | Cons |
|---|---|---|
| A. Individuals prepping one real negotiation | Fastest reach; acute time-boxed pain; matches existing self-serve code and prior strategy ($19/mo Pro, $49–99 prep pack) | Crowded $9.99 low end; low LTV; outcome hard to prove |
| B. Negotiation instructors (b-school, exec-ed) | They already run utility-scored role-plays; no incumbent has AI counterparts; credible validation and distribution | Slow cycles, low budgets, case IP licensing, faculty building their own agents |
| C. Mid-market sales enablement | Biggest budgets; incumbents' setup/scoring/pricing complaints are exploitable | Head-on with Yoodli/Hyperbound/Synthesia; voice realism is the buyer's first filter; SSO/SCIM/security reviews |

---

## 4. Rebuild from scratch?

**No.** Keep the app; build the simulation engine as a new, runtime-agnostic TypeScript
package in the same repo.

| Path | Relative cost | Why |
|---|---|---|
| Rebuild (Next 16 + Better Auth + Drizzle + Vitest + AI SDK 7 + Workflows/Convex) | Highest; a long stretch with zero user-visible progress | Rewrites the 5.4k-LOC LLM layer that is the product IP; the sim engine costs the same in either world |
| Keep app, separate service (Trigger.dev / Bun worker / Python LangGraph) | Middle | Two deploys, service auth; Python doubles the LLM layer |
| Keep app, engine as package, hosted by Vercel Workflows | **Lowest** | Auth/DB/Selenium cleanup is small and bounded; nothing in 2026 is a step-change over this stack |

Stack findings that matter:

- **Auth:** Clerk is free to 50k monthly retained users; a third auth migration is churn. Auth.js is in maintenance mode under Better Auth (Vercel acquired Better Auth July 2026). Move to Better Auth only if offline dev or free orgs become necessary.
- **Data:** stay on Prisma + Postgres (Neon). Model the tree as adjacency list plus materialized path/depth; store transcripts as the ancestor chain, evaluations per node. Do not migrate to Drizzle or Convex. SQLite-in-dev/Postgres-in-prod is an anti-pattern Prisma explicitly does not support; use Docker Postgres or a Neon branch locally.
- **Orchestration:** Vercel Workflows (GA April 2026, open-source SDK, hooks for human pause, persisted streams, 800s/step). Trigger.dev is the escape hatch if step limits bite. Inngest's free tier allows 5 concurrent steps, too few for parallel expansion.
- **LLM layer:** keep the existing chain for chat. Use AI SDK 7 only inside the new package. Prompt caching is the single biggest lever: siblings share the ancestor transcript, so cached reads cost 0.1×. Estimated cost of a 200-node interactive tree on Sonnet 5 with 85% cache hits: $1.50–4; half in batch mode. Anthropic structured outputs: flat schemas only, no min/max, and changing format invalidates the cache.
- **Testing:** delete Selenium and chromedriver and the second Jest config; keep Playwright. Do not migrate 1,246 Jest tests to Vitest for its own sake; the new package is ESM + Vitest from day one.

---

## 5. Product plan (draft, pending grilling answers)

Ordering (no time estimates; sequence only): the thing that proves the moat is fork-and-compare on a counterpart
that fights back. Everything else either unblocks that or monetizes it.

### Phase 0 — Unblock
Clone-to-login works. Auth S1–S9 fixed. Selenium removed. `.env.example` and README truthful.
Plan store retired or kept (decision Q4).

### Phase 1 — Finish the creator promise
Learner-created scenarios carry evaluation criteria. Roles with confidential briefs reach the
persona prompt. Learner picks a side. Generate-scenario modal mounted. Win condition enforced.

### Phase 2 — An opponent that fights back, a scorecard that measures
Scenario schema gains issues, weights, reservation value, target, BATNA per side. Persona
keeps a validated deal-state ledger each turn (the minimal ledger, not the full 9-task memory
phase). Evaluation adds negotiation-native metrics: opening anchor, concession pattern,
BATNA use, surplus split. Difficulty levels. This alone makes the product visibly different
from ChatGPT.

### Phase 3 — Simulation
- 3a Tree schema and engine package: nodes, expansion policy, per-run token budget, depth/breadth caps.
- 3b Agent-vs-agent rollouts with both sides carrying ledgers; utility-grounded ranking.
- 3c Durable host (Vercel Workflows), streaming node updates into the existing chat UI.
- 3d Takeover: pause a node, learner authors the turn, new branch, graded against best sibling.
- 3e Fork-and-compare replay for ordinary practice sessions (every user turn gets a searched alternative).
- 3f Batch/overnight mode for "prep for my real negotiation".

### Phase 4 — Monetize and launch
Stripe; Free (3 practice/mo), Pro $19/mo (20 simulations), one-time prep pack $49–99;
public scenario pages; shareable redacted simulation report; landing page; onboarding.

### Deferred
Voice mode, cross-session persona memory of the learner (phase 2B in the old plan), team
seats, instructor licensing, trained adversary.

---

## 6. Engineering plan (draft, pending grilling answers)

### Repo shape
```
persuaider/
  src/                      existing Next.js app (unchanged runtime)
  packages/sim-engine/      pure TS: tree, policies, budgets, scoring; ESM + Vitest; no Next imports
  packages/sim-host-vercel/ thin adapter: Workflows steps, hooks for takeover, stream publish
  prisma/                   + Simulation, SimNode, SimEvaluation, DealLedger tables
  docs/plans/, docs/adr/, CONTEXT.md
```

### Phase 0 tasks
1. `Makefile`: drop `ensure-auth` from `dev`/`build`/`test`; `test` = unit only; tolerant key parse; Postgres URL in the env template; `GOOGLE_GEMINI_API_KEY`.
2. `src/lib/auth/clerk.ts`: log in the catch; lazy-upsert Prisma user when `clerkId` unknown.
3. `src/middleware.ts`: resolve admin via `getAuthSession()`; `PATCH /api/admin/users/[id]` also writes Clerk `publicMetadata.role`; `make promote-admin`.
4. Delete: Selenium suite, `e2e/jest.e2e.config.js`, chromedriver deps, `jest.config.mjs` next-auth transforms, `src/lib/validation/auth.ts`, dead smoke assertions. Migration dropping `passwordHash`, `provider*`, token tables, `strategyMemory`, `sourceDocument`.
5. Rewrite `.env.example` and README auth sections. Docker compose for local Postgres.
6. Move uploads to Vercel Blob (or defer with a documented limitation).

### Phase 1 tasks
1. `POST /api/scenarios` accepts full scenario payload (reuse admin validation).
2. `buildPersonaPrompt` injects the Persona's Role brief and `contextNotes`; remove the 2–4 sentence cap in favor of a per-scenario style setting.
3. Side selection at conversation start; `Conversation.roleId`.
4. Mount `GenerateScenarioModal` on the dashboard.
5. Enforce `winCondition` in the message route.

### Phase 2 tasks
1. Schema: `ScenarioIssue` (name, weight per side, range), per-Role `reservation`, `target`, `batna`.
2. Zod schemas for structured LLM outputs; a `generateStructured` on the chain with flat schemas.
3. `DealLedger` rows per turn (offer, concession, gap) authored by the persona, validated, replayed into the next prompt.
4. Evaluation v2: negotiation metrics computed from the ledger in code, technique rubric from the LLM.
5. Difficulty as a prompt + ledger policy.

### Phase 3 tasks (engine package first, host second)
1. Tables: `Simulation(scenarioId, config, budget, status)`, `SimNode(simId, parentId, path, depth, side, content, ledgerJson, status)`, `SimEvaluation(nodeId, utilityA, utilityB, rubricJson, cost)`.
2. `sim-engine`: `expand(node, k)`, `rollout(node, maxDepth)`, `rank(tree)`, `budget` guard; in-process host for tests; recorded LLM fixtures.
3. Prompt-caching: system + persona + ancestor chain as the cached prefix; 1-hour TTL in batch mode.
4. `sim-host-vercel`: one child run per subtree expansion; persisted streams; hook per `awaiting_human` node.
5. UI: tree outline on the existing chat components; node → transcript; takeover composer; compare view (your branch vs best sibling, utility delta, rubric delta).
6. Fork-and-compare for ordinary practice: after each user turn, expand k alternatives asynchronously; show in the summary.
7. Batch mode using provider batch APIs (50% off) for overnight briefs.
8. Cost telemetry per simulation; hard caps.

### Phase 4 tasks
Stripe checkout + webhook + credit balance; public `/s/[slug]` with OpenGraph; redacted report page; landing and onboarding; production checklist (rate limiting requires Upstash keys or it silently no-ops today).

### Testing policy going forward
Unit tests only for pure logic (engine, parsers, ledger math). Route tests only where they
assert authorization or data shape. Playwright for the loop. No test that only re-asserts a
mock. Target: fewer, sharper tests than the 18.6k lines today.

---

## 7. Things I could not do

- **Global hooks were not removed.** The project has no `.claude/` directory; the hooks that fired this session live in `~/.claude-personal/settings.json` (eleven agent-memory hooks). Editing that file was blocked by the permission classifier as self-modification. Command to do it yourself is in the chat reply.
- G2, Reddit, SSRN, MIT Press were blocked; competitor cons are relayed through competitor blogs and flagged as such.
- Pricing figures for Hyperbound, Second Nature, Zenarate, Virti, Yoodli valuation, Quantified funding, Restate: single-source, unverified.

---

## 8. Decisions taken 2026-09-19 (round 1)

All ten recommendations accepted: continue (no rebuild); wedge A with one instructor pilot;
keep Clerk; retire the plan harness (archived under `docs/archive/plan-harness-2026-08`);
branch on the learner's side only; utility-primary ranking; takeover vs best sibling;
Phases 1 and 2 before the engine; voice deferred; prune mock-only tests during auth cleanup.
No timeline estimates are to be given going forward.

---

## 9. Architecture audit (2026-09-19, second pass)

Vocabulary: module, interface, seam, adapter, depth, locality.

### Facts found

- No domain layer. Every route and server component calls Prisma directly. "Start a
  conversation" exists three times (`conversations/route.ts:99-179`, `reattempt/route.ts:65-110`,
  `chat/page.tsx:19-113`); "take a turn" exists twice with divergent model settings
  (`messages/route.ts`, `messages/stream/route.ts:76,83`). Writes are not transactional.
- Authorization hole: any learner can open `/persona/<any-id>/chat`; the page checks neither
  membership nor verification (`chat/page.tsx`, `middleware.ts:4`).
- The email-verification block is copy-pasted into 11 routes and is dead: `auth/clerk.ts:33`
  hardcodes `emailVerified: true`.
- JSON-as-text columns are parsed in four incompatible styles at 18 sites; no typed codec.
  Zod is a dependency with zero uses.
- Scenario validators are byte-identical twice (~200 lines).
- LLM port: no structured output (JSON scraped by regex, duplicated twice), no prompt caching,
  no cost accounting (usage is returned and discarded by every caller), no cancellation (client
  disconnect keeps billing), no fake adapter (tests use five different mock seams). Model pins
  are stale (`claude-sonnet-4-5-20250929`, `gemini-2.0-flash`).
- Persona prompt drops `persona.description`, `characteristics.openness`, `contextNotes`,
  `Role.description`, framework `elements` and `weight`. Authors write things nothing reads.
- Evaluation: `overallScore` is the model's opinion; framework weights are never applied;
  parse failure and total outage both store 50/100.
- Client: `@tanstack/react-query` unused; dashboard re-renders every 3 seconds with 3 queries;
  hand-rolled SSE reader; types redeclared on both sides of the wire; `LLMMessage` and friends
  defined twice.
- Uploads hardwired to local disk in three places; 17 binaries committed; the "PDF" export
  is unescaped HTML (`export/pdf/route.ts:90-103`). `@react-pdf/renderer`, `nodemailer` unused.
- No CI. No `.github`. `make ci` needs live Clerk, Postgres and paid LLM calls; `format`
  scripts do not exist. Nothing gates a merge except Vercel's build.

### Structural changes, in dependency order

1. Typed codec per JSON column (Zod), reused for request validation. Prerequisite for the engine.
2. Widen the LLM port: `complete({messages, schema?, signal, budget})` → `{value, usage,
   provider}`; structured output per provider; `FakeProvider` and `RecordingProvider`; cost
   recorded per call. Update model pins.
3. `takeTurn` and `startConversation` modules owning validation, authorization, transaction,
   prompt build, mood, and usage. Routes become thin.
4. `buildPersonaContext` loader that feeds the prompt everything authors wrote, shared by turn
   and engine.
5. Scoring arithmetic in code: weighted framework aggregate now; deal utility from Issues next.
6. `BlobStore` port with local and Vercel Blob adapters.
7. Engine as `src/engine/` with an import rule forbidding Next.js and Prisma, ports injected.
8. CI: `ci-fast` (typecheck, lint, unit, build) on every push; integration and Playwright on
   preview.

## 10. Decisions taken 2026-09-19 (rounds 2 and 3)

All accepted: structural slices paired with a visible fix; engine as `src/engine/` with an
import lint rule; ten probe transcripts as the opponent gate and five ranked transcripts as
the evaluator gate; blocked slices are listed and skipped, owner pulled in only after two
consecutive blocks; one guided setup script for Vercel/Neon/Clerk/GitHub; I merge when gates
pass; Vercel preview + Neon branch per slice; Vercel Workflows host; multi-issue schema with
AI-proposed numbers; fork-and-compare on demand, 3 alternatives × 10 turns; hard per-user
daily token budget on every tier; Free 3 sessions, Pro $19 with 20 simulations, prep pack
$79 for 30 days; success gate before engine work is ten strangers complete a session and five
say the opponent felt real. No humans have used the product yet. No instructor pilot.
First slice: CI plus sign-up → dashboard → admin reachable.
