# 0001 — Simulation engine is a pure TypeScript package; branches are ranked by utility

Date: 2026-09-19. Status: accepted.

## Context
Capabilities 2 and 3 (agent-only simulation, human takeover) do not exist. Prompted LLMs are
weak negotiators and agent-vs-agent runs without structured deal state rarely reach a deal.
The owner does not review code and needs progress to be visible as behavior.

## Decision
- Keep the existing Next.js app. Do not rebuild.
- The engine lives in `packages/sim-engine`: pure TypeScript, no Next.js imports, ESM + Vitest,
  runnable in-process for tests. A thin host adapter runs it on Vercel Workflows.
- The Tree is stored in Postgres (adjacency list + materialized path), never in workflow state.
- Branching happens only at the learner's side's turns. The counterpart is sampled once per node.
- Branches are ranked by Utility computed in code from Issues, weights and reservation values.
  The LLM technique rubric is secondary.
- Takeover compares the learner's branch to the best sibling from the same node.

## Consequences
- Scenarios must carry Issues, per-side weights, reservation values and targets before the
  engine is useful. This is Phase 2 and blocks Phase 3.
- Hosting can move to Trigger.dev or a worker without touching engine code.
- Utility-based ranking is only as good as the scenario's numbers; scenarios without them get
  rubric-only ranking and a visible "unscored" label.
