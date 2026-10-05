# Working rules for Persuaider

The owner's only job is to run through a demo. They never read a PR, a diff, a reviewer
report, code, or a plan, and are never asked to decide anything on GitHub. Every gate is a
machine (CI, branch protection, reviewer agents) or it does not exist. If a rule needs the
owner to check something, the rule is wrong. Progress is judged only by behavior they can
click through in a browser, and every report to them is a URL plus numbered click steps. Read `CONTEXT.md` for vocabulary and
`docs/plans/2026-09-19-assessment-and-plan.md` for the plan and decisions.

## Peeraxis

Peeraxis builds and publishes Persuaider features through `.peeraxis/project.json`, which says
how to set up, check and demo this project and which files a feature may change.

## What stops spinning

- No tests that only assert a mock was called. No test-count reporting as progress.
- No timeline estimates, ever. Sequence only.
- No re-auditing the codebase. The state is recorded; trust it unless a test disagrees.

## Style

Plain sentences. Lead with the result. No headers in short messages. No bullets inside
bullets. If the owner needs to decide something, ask one question with one recommended
answer.

## Tests

Three layers, and a feature is not done until all pass:

1. Playwright (functional), against a production build. Selenium is removed; do not add it
   back.
2. Integration: real Postgres (Neon branch in CI, Docker locally), real routes, real Prisma.
   Every API route a feature touches gets one for authorization and data shape. Engine tests
   run whole trees against recorded LLM fixtures.
3. Unit: pure logic only (utility math, ledger, ranking, parsers).

Assertions about LLM replies are structural (a reply arrived, it contains a figure), never
semantic. Unit and integration tests never call the LLM live; they use recorded fixtures. A
nightly live smoke with a spend cap catches provider drift. Existing mock-heavy tests are
pruned area by area as each is touched, never in one sweep.

Gate order: typecheck, build, unit, integration, Playwright.

## Product rules

- Every LLM call records tokens and cost. Every user has a hard daily token budget.
- Spend is capped in the app: per-user daily budget plus a global daily cap. No gate depends
  on the owner touching a provider console.
- Engine code lives in `src/engine/` and may not import Next.js or Prisma.
- No engine work until ten strangers have completed a practice session on the preview and
  five say the opponent felt real.
- Features advance the three capabilities in the accepted order: author and practise with
  feedback; agent-only simulation over many paths; step in and be graded against the best
  continuation.
