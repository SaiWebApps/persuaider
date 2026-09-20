# 0002 — Deal state is extracted after a session, not authored per turn (for now)

Date: 2026-09-20. Status: accepted (owner decision, 2026-09-20).

## Context
The plan and ADR 0001 assumed a validated per-turn ledger (offers, concessions, gap) authored
by the persona and fed back into the next prompt, because research reports agent-vs-agent runs
without structured deal state rarely reach agreement. Slices 4–5 shipped a cheaper design:
hidden numbers in the persona prompt, and one narrow model call after the session that
extracts each side's last position and any agreed figure, with all arithmetic in code.

## Decision
Keep post-hoc extraction while the product is human-vs-AI practice. Build the per-turn ledger
when the simulation engine needs structured state on every node, not before.

## Consequences
- Within a session the persona's only memory of the deal is the transcript; drift over long
  sessions is possible and is bounded today by the 30-message evaluation window and the hard
  rules in the prompt.
- The extraction can be wrong or unparseable; unparseable is stored as unknown, never as
  "no deal". Transcript turns are tagged by speaker so a learner cannot forge a counterpart line.
- Capability 3 needs utility per node (grading a takeover against the best sibling); post-hoc
  extraction yields one number per finished transcript, so `rank(tree)` and per-node utility
  (Phase 3 tasks 1–2) have nothing to compute from. The per-turn ledger is therefore the first
  engine task, before the tree schema, and is carried per side through every rollout.
