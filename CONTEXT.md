# Persuaider — Domain Glossary

Ubiquitous language for the product. Terms marked **(settled)** are how the code already
uses the word. Terms marked **(open)** are proposed and awaiting a decision; see
`docs/plans/2026-09-19-assessment-and-plan.md` for the questions.

## Settled

- **Scenario** (settled) — A negotiation situation an author creates: title, description, the
  two sides, evaluation criteria, win condition, tags, visibility. The user has also called
  this a "world". *Scenario* is the canonical term.
- **Persona** (settled) — One AI counterpart inside a Scenario, with a name, description,
  personality characteristics, and an initial greeting. A Scenario has one or more Personas.
- **Role** (settled) — A side in a Scenario with a confidential brief. A Persona belongs to a Role;
  a Conversation records the Role the learner played. The Scenario's `learnerRoleId` names the
  side Issues call "learner". Briefs carry story; Issues carry numbers. There is no per-session
  side chooser yet.
- **Learner** (settled) — A signed-in user with role `user` who practices.
- **Admin** (settled) — A signed-in user with role `admin` who authors and reviews.
- **Author** (settled, informal) — Whoever creates a Scenario (admin today; learners via a
  reduced API).
- **Conversation** (settled) — One practice session between a Learner and a Persona: an ordered
  list of Messages, ending in a Summary. Also called a "session" in the UI.
- **Message** (settled) — One turn in a Conversation, authored by `user` or `assistant`;
  assistant turns carry a Mood.
- **Mood** (settled) — The Persona's displayed emotional state after a turn (one of seven).
- **Summary** (settled) — The LLM evaluation of a completed Conversation: overall score 0–100,
  per-framework scores, winning arguments, written feedback. Called "feedback" or "evaluation"
  in conversation; *Summary* is the stored object, *Evaluation* is the act of producing it.
- **Framework** (settled) — A named evaluation lens with weighted criteria (e.g. CLEAR, AIDA).
- **Win condition** (settled, unenforced) — A stored rule for when a Conversation counts as won
  (manual, max messages, score threshold). Nothing enforces it at runtime today.
- **Reattempt** (settled, no UI) — Starting a fresh Conversation with the same Persona after a completed one; resumes an in-progress one if it exists.
- **Fork** (settled) — Copying a public Scenario into your own library.
- **Join code** (settled) — A short code that adds a Learner to a Scenario.

## Open

- **Simulation** (settled 2026-09-19) — An agent-only run of a Scenario in which AI plays
  every side, producing a Tree. Branching happens only at the Learner's side's turns; the
  Counterpart is sampled once per Node.
- **Rollout** (settled 2026-09-19) — One linear agent-vs-agent playthrough from a starting state to an end.
- **Tree / Node / Branch** (settled 2026-09-19) — The structure produced when a Simulation explores several
  continuations from the same state. A Node is one state (transcript prefix); a Branch is a
  path from root to leaf.
- **Best path** (settled 2026-09-19) — The Branch a Simulation ranks highest. Ranked by deal
  Utility first, technique rubric second.
- **Utility** (settled 2026-09-19) — The value of an outcome to one side, computed from the
  Scenario's Issues, weights, and that side's reservation value. Not an LLM opinion.
- **Issue** (settled 2026-09-19) — One negotiable dimension of a Scenario (price, start date,
  scope) with a range and a weight per side.
- **Takeover** (settled 2026-09-19) — A Learner stepping into a Node and authoring the next
  turn themselves, creating a new Branch that is graded against the agent's best sibling from
  that same Node.
- **Counterpart** (settled 2026-09-19) — The side the Learner negotiates against. Today this is the Persona;
  in a Simulation both sides are counterparts to each other.
- **Ledger** (settled 2026-09-19; "deal state" is the same thing) — A structured record of offers, concessions and remaining
  gap kept per side during a Conversation or Simulation.
