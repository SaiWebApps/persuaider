# Working rules for Persuaider

The owner's only job is to run through a demo. They never read a PR, a diff, a reviewer
report, code, or a plan, and are never asked to decide anything on GitHub. Every gate is a
machine (CI, branch protection, reviewer agents) or it does not exist. If a rule needs the
owner to check something, the rule is wrong. Progress is judged only by behavior they can
click through in a browser, and every report to them is a URL plus numbered click steps. Read `CONTEXT.md` for vocabulary and
`docs/plans/2026-09-19-assessment-and-plan.md` for the plan and decisions.

## Unit of work: a slice

A slice is one user-visible behavior. Before writing code, write its acceptance test as a
numbered list of steps a person can click through in under two minutes, each ending in
something they can see. The owner approves these steps; they become the Outcome's locked
Demonstration (see "Delivery through Peeraxis"). Example:

1. Open the app, sign up with a new email. You land on the dashboard.
2. Click "Salary Negotiation", then "Alex Chen". A chat opens with a greeting.
3. Send "I want 20% more". A reply arrives that pushes back and names a number.

A slice is done when Peeraxis's run of the locked Demonstration passes every step and
`scripts/peeraxis/check.sh` passes. Nothing else counts.

## What stops spinning

- No work starts without a written acceptance test. No acceptance test, no code.
- Anything discovered mid-slice that is not needed to pass the acceptance test goes in one
  line under "Noticed, not done" in your final message. It is not fixed, investigated, or
  expanded.
- A slice touches only the files it listed. Refactors outside that list are a separate slice.
- Peeraxis gives an Outcome at most two attempts and stops it after that. If you cannot make
  the acceptance pass, stop and report what failed with the exact output. Do not try a third
  approach silently.
- No tests that only assert a mock was called. No test-count reporting as progress.
- No timeline estimates, ever. Sequence only.
- No re-auditing the codebase. The state is recorded; trust it unless a test disagrees.

## Delivery through Peeraxis

Work is delivered through Peeraxis Outcomes, not pull requests. Do not write PR bodies, open,
review or merge PRs, deploy, use the Vercel preview, or post anything on GitHub.

- Each Outcome's approved steps are locked as one Playwright test in
  `e2e/playwright/acceptance/`: its top-level `test.step` titles are the steps verbatim, each
  step contains at least one assertion of what it says, and it runs with zero retries. The
  locked spec and `.peeraxis/outcomes/<name>/acceptance.json` are read-only for you. Change only
  the Outcome's allowed paths.
- Checks you run yourself, inside your sandbox, before you finish: `npx tsc --noEmit`,
  `npm run lint`, and `npx jest --ci <paths you touched>`. In your sandbox the real-Postgres
  integration suites report as skipped (there is no database); that is expected, not a pass.
- Do not run `scripts/peeraxis/check.sh` or `scripts/peeraxis/demo.sh`: your sandbox cannot
  start their throwaway Postgres (it fails at "postgres up"). Peeraxis runs both itself,
  outside your sandbox, on your commit. `check.sh` is the full gate: migrations from scratch,
  schema drift, typecheck, lint, unit and real-Postgres integration tests, build. `demo.sh`
  builds the app for production and runs the locked spec against a throwaway database and
  the Clerk development instance; it must fail before you build and pass every step on your
  commit. Only Peeraxis's runs count.
- Assertions about LLM replies are structural (a reply arrived, it contains a figure), never
  semantic.
- Peeraxis runs the independent reviewers and the two-attempt stop. A parked item ("Noticed,
  not done") with reviewer severity high becomes the next slice. The owner is never asked to
  park anything.
- Spend is capped in the app: per-user daily budget plus a global daily cap. No gate depends
  on the owner touching a provider console.
- Your final message is plain words: what changed, then "Noticed, not done" one-liners.

## Style

Plain sentences. Lead with the result. No headers in short messages. No bullets inside
bullets. If the owner needs to decide something, ask one question with one recommended
answer.

## Tests

Three layers, and a slice is not done until all pass:

1. Playwright (functional): one test per slice, the acceptance steps verbatim, run locally by
   Peeraxis against a production build. Selenium is removed; do not add it back.
2. Integration: real Postgres (Neon branch in CI, Docker locally), real routes, real Prisma.
   Every API route a slice touches gets one for authorization and data shape. Engine tests run
   whole trees against recorded LLM fixtures.
3. Unit: pure logic only (utility math, ledger, ranking, parsers).

The LLM is never called live in a gate; use recorded fixtures. A nightly live smoke with a
spend cap catches provider drift. Existing mock-heavy tests are pruned area by area as each
is touched, never in one sweep.

Gate order per slice: typecheck, build, unit, integration, the locked Demonstration.

## More rules (2026-09-19)

- A structural slice (no new behavior) is allowed only when paired with one visible bug fix,
  and its acceptance test is "everything clickable before still works, plus that fix".
- A blocked slice is listed under "Blocked" and skipped. Pull the owner in only after two
  consecutive blocked slices.
- Every LLM call records tokens and cost. Every user has a hard daily token budget.
- Engine code lives in `src/engine/` and may not import Next.js or Prisma.
- No engine work until ten strangers have completed a practice session on the preview and
  five say the opponent felt real.

## Review (2026-09-20, owner's rule)

Peeraxis lands nothing until independent adversarial reviewers (separate agents that did not
write the code) have read the full diff, run the tests, and reported:

1. Process reviewer: are the working rules obeyed? Acceptance steps present and verbatim in
   a Playwright test; structural work paired with a visible fix; no timelines; no mock-only
   tests where behaviour matters; integration tests on real Postgres for touched routes;
   migrations apply from scratch; nothing claimed that the reviewer could not reproduce.
2. Goal reviewer: does the slice advance the three capabilities (author and practise with
   feedback; agent-only simulation over many paths; step in and be graded against the best
   continuation) in the accepted order, without drift, gold-plating, or quietly skipped items?

Every finding is either fixed in the slice or listed under "Noticed, not done" with the
reviewer's severity.
