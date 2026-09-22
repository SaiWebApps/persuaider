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
something they can see. Put it at the top of the slice's PR description. Example:

1. Open the preview URL, sign up with a new email. You land on the dashboard.
2. Click "Salary Negotiation", then "Alex Chen". A chat opens with a greeting.
3. Send "I want 20% more". A reply arrives that pushes back and names a number.

A slice is done when every step passes on the preview deployment, the Playwright test for
those steps passes, and `npm run build` plus `npm test` pass. Nothing else counts.

## What stops spinning

- No work starts without a written acceptance test. No acceptance test, no code.
- Anything discovered mid-slice that is not needed to pass the acceptance test goes in one
  line under "Noticed, not done" in the PR. It is not fixed, investigated, or expanded.
- A slice touches only the files it listed. Refactors outside that list are a separate slice.
- If a slice cannot pass its acceptance test after two genuine attempts, stop and report
  what failed with the exact output. Do not try a third approach silently.
- No tests that only assert a mock was called. No test-count reporting as progress.
- No timeline estimates, ever. Sequence only.
- No re-auditing the codebase. The state is recorded; trust it unless a test disagrees.

## How to report

Every report to the owner is at most eight lines, in this shape:

```
Slice: <name>
Preview: <url>
Try: <the numbered steps, or "same as PR">
Result: passed | failed at step N: <what you would see>
Noticed, not done: <zero or more one-liners>
Next slice: <name>
```

Plain words. No file paths, no code, no options, no "considerations".

## Style

Plain sentences. Lead with the result. No headers in short messages. No bullets inside
bullets. If the owner needs to decide something, ask one question with one recommended
answer.

## Tests

Three layers, and a slice is not done until all pass:

1. Playwright (functional): one test per slice, the acceptance steps verbatim, run against
   the preview deployment. Selenium is removed; do not add it back.
2. Integration: real Postgres (Neon branch in CI, Docker locally), real routes, real Prisma.
   Every API route a slice touches gets one for authorization and data shape. Engine tests run
   whole trees against recorded LLM fixtures.
3. Unit: pure logic only (utility math, ledger, ranking, parsers).

The LLM is never called live in a gate; use recorded fixtures. A nightly live smoke with a
spend cap catches provider drift. Existing mock-heavy tests are pruned area by area as each
is touched, never in one sweep.

Gate order per slice: typecheck, build, unit, integration, Playwright on preview.

## More rules (2026-09-19)

- A structural slice (no new behavior) is allowed only when paired with one visible bug fix,
  and its acceptance test is "everything clickable before still works, plus that fix".
- A blocked slice is listed under "Blocked" and skipped. Pull the owner in only after two
  consecutive blocked slices.
- Every LLM call records tokens and cost. Every user has a hard daily token budget.
- Engine code lives in `src/engine/` and may not import Next.js or Prisma.
- No engine work until ten strangers have completed a practice session on the preview and
  five say the opponent felt real.

## Demo gate (2026-09-20, owner's rule): the steps are the test

- The PR body's numbered acceptance steps are generated from the slice's acceptance spec
  (`e2e/playwright/acceptance/slice-NN.spec.ts`). Each step is a `test.step` whose title is the
  step text and which contains at least one assertion. `scripts/check-acceptance.mjs` fails CI
  if a step in the PR body is missing from the spec, reworded, or has no assertion, and after
  the run fails CI if the Playwright report does not show every step passed.
- Acceptance specs run with zero retries. Assertions about LLM replies are structural (a reply
  arrived, it contains a figure), never semantic.
- The acceptance spec also runs against the PR's Vercel preview URL; that status is required.
- `main` is protected: required checks, no admin bypass. Nobody merges red, including me.
- A parked item ("Noticed, not done") with reviewer severity high blocks the merge and becomes
  the next slice. The owner is never asked to park anything.
- Each reviewer agent posts its full report as its own PR comment under a fixed heading; a
  status check requires both. The owner never reads them.
- A PR with more than six CI runs and no green is labelled `blocked`; work stops and the
  eight-line report says so.
- Spend is capped in the app: per-user daily budget plus a global daily cap. No gate depends
  on the owner touching a provider console.

## Review gate (2026-09-20, owner's rule)

No slice merges until two independent adversarial reviewers (separate agents that did not
write the code) have each read the full diff, run the tests, and reported:

1. Process reviewer: are the working rules obeyed? Acceptance steps present and verbatim in
   a Playwright test; structural work paired with a visible fix; no timelines; no mock-only
   tests where behaviour matters; integration tests on real Postgres for touched routes;
   migrations apply from scratch; nothing claimed that the reviewer could not reproduce.
2. Goal reviewer: does the slice advance the three capabilities (author and practise with
   feedback; agent-only simulation over many paths; step in and be graded against the best
   continuation) in the accepted order, without drift, gold-plating, or quietly skipped items?

Every finding is either fixed in the slice or listed under "Noticed, not done" with the
reviewer's severity. Both verdicts are quoted in the PR body. "Passed" without both reports
is not accepted.
