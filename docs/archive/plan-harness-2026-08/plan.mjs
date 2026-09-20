#!/usr/bin/env node
/**
 * The execution plan and its progress, stored in SQLite rather than in a file
 * anyone can edit.
 *
 * The store has one rule that everything else follows from: an agent may record
 * what it claims and the terminal output it produced, but it may not write a
 * status. Status exists only in the `verification` table, and only `verify`
 * writes there — after reading the commit log and, on request, running the
 * suite itself. A claim and a verification that disagree is a mismatch, and a
 * mismatch is a non-zero exit.
 *
 * Spec text is append-only. Editing a task writes a new revision with a content
 * hash beside the old one; nothing is overwritten, so a spec that was quietly
 * weakened mid-task is visible by comparing revisions.
 */

import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = join(ROOT, '.plan');
const DB_PATH = join(DB_DIR, 'state.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS phase (
  id      TEXT PRIMARY KEY,
  seq     INTEGER NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  unlocks TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS task (
  id       TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phase(id),
  seq      INTEGER NOT NULL,
  title    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spec_revision (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        TEXT NOT NULL REFERENCES task(id),
  files          TEXT NOT NULL DEFAULT '',
  steps          TEXT NOT NULL DEFAULT '',
  out_of_scope   TEXT NOT NULL DEFAULT '',
  verify         TEXT NOT NULL DEFAULT '',
  commit_message TEXT NOT NULL DEFAULT '',
  content_hash   TEXT NOT NULL,
  author         TEXT NOT NULL DEFAULT 'import',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gate (
  id          TEXT PRIMARY KEY,
  phase_id    TEXT NOT NULL REFERENCES phase(id),
  requirement TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note (
  slug  TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES task(id),
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES task(id),
  command    TEXT NOT NULL,
  exit_code  INTEGER,
  output     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT NOT NULL REFERENCES task(id),
  status     TEXT NOT NULL,
  commit_sha TEXT,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_phase       ON task(phase_id);
CREATE INDEX IF NOT EXISTS idx_spec_task        ON spec_revision(task_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_claim_task       ON claim(task_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_task    ON evidence(task_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_verification_task ON verification(task_id, id DESC);
`;

function open(dbPath = process.env.PLAN_DB || DB_PATH) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

const now = () => new Date().toISOString();
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The repository whose log decides status. Overridable so the tests can build one. */
const GIT_ROOT = process.env.PLAN_GIT_ROOT || ROOT;

function git(args) {
  try {
    return execFileSync('git', args, { cwd: GIT_ROOT, encoding: 'utf8', timeout: 20000 });
  } catch {
    return '';
  }
}

/** The newest spec revision for a task, or null when it has none. */
function specOf(db, taskId) {
  const rows = db
    .prepare('SELECT * FROM spec_revision WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .all(taskId);
  return rows[0] || null;
}

function tasksInOrder(db) {
  return db
    .prepare(
      `SELECT task.*, phase.seq AS phase_seq, phase.name AS phase_name
         FROM task JOIN phase ON phase.id = task.phase_id
        ORDER BY phase.seq, task.seq`
    )
    .all();
}

// ── verification ─────────────────────────────────────────────────────────────

/**
 * Commit subjects grouped by the task id in their `type(id):` prefix.
 *
 * A `fix` commit is counted separately because some tasks are defined to
 * produce them: a review task that finds nothing commits once, and one that
 * finds three problems commits four times. Treating those as duplicates would
 * make the task permanently unverifiable.
 */
function commitsByTask() {
  const log = git(['log', '--pretty=format:%H%x09%s']);
  const byTask = new Map();
  for (const line of log.split('\n')) {
    const [sha, subject] = line.split('\t');
    if (!sha || !subject) continue;
    const match = subject.match(/^([a-z]+)\(([^)]+)\):/);
    if (!match) continue;
    const [, type, id] = match;
    if (!byTask.has(id)) byTask.set(id, { primary: [], fixes: [] });
    byTask.get(id)[type === 'fix' ? 'fixes' : 'primary'].push({ sha, subject });
  }
  return byTask;
}

/**
 * What the repository says about a task, ignoring entirely what was claimed.
 *
 * Returns `done`, `todo`, or `mismatch` with the reason spelled out. A task
 * whose spec asks for no commit is judged on its evidence alone, because there
 * will never be a commit to find.
 */
function derive(db, task, commits) {
  const spec = specOf(db, task.id);
  const wantsCommit = !!spec && !/^none\b/i.test((spec.commit_message || '').trim());
  const found = commits.get(task.id) || { primary: [], fixes: [] };
  const evidenceCount = db
    .prepare('SELECT COUNT(*) AS n FROM evidence WHERE task_id = ?')
    .all(task.id)[0].n;

  if (wantsCommit && found.primary.length > 1) {
    return {
      status: 'mismatch',
      sha: found.primary[0].sha,
      reason: `${found.primary.length} non-fix commits carry this id; a task lands in exactly one`,
    };
  }
  if (wantsCommit && found.primary.length === 0) {
    return { status: 'todo', sha: null, reason: 'no commit carries this id' };
  }
  if (evidenceCount === 0) {
    return {
      status: wantsCommit ? 'mismatch' : 'todo',
      sha: found.primary[0]?.sha || null,
      reason: 'no verify output recorded',
    };
  }
  return {
    status: 'done',
    sha: found.primary[0]?.sha || null,
    reason: wantsCommit
      ? `commit and ${evidenceCount} evidence record(s)`
      : `${evidenceCount} evidence record(s), no commit required`,
  };
}

function latestClaim(db, taskId) {
  const rows = db
    .prepare('SELECT * FROM claim WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .all(taskId);
  return rows[0] || null;
}

function latestStatus(db, taskId) {
  const rows = db
    .prepare('SELECT * FROM verification WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .all(taskId);
  return rows[0] ? rows[0].status : 'todo';
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdVerify(db, argv) {
  const full = argv.includes('--full');
  const commits = commitsByTask();
  const tasks = tasksInOrder(db);
  const stamp = now();
  const rows = [];
  let mismatches = 0;

  for (const task of tasks) {
    const result = derive(db, task, commits);
    db.prepare(
      'INSERT INTO verification (task_id, status, commit_sha, reason, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, result.status, result.sha, result.reason, stamp);

    const claim = latestClaim(db, task.id);
    const claimed = claim ? 'claimed' : '—';
    const flagged = result.status === 'mismatch' || (claim && result.status !== 'done');
    if (flagged) mismatches += 1;
    rows.push({ id: task.id, claimed, derived: result.status, reason: result.reason, flagged });
  }

  const width = Math.max(...rows.map((r) => r.id.length), 4);
  console.log(`${'TASK'.padEnd(width)}  CLAIMED    DERIVED    REASON`);
  for (const row of rows) {
    if (row.derived === 'todo' && row.claimed === '—') continue;
    const mark = row.flagged ? '  MISMATCH' : '';
    console.log(
      `${row.id.padEnd(width)}  ${row.claimed.padEnd(9)}  ${row.derived.padEnd(9)}  ${row.reason}${mark}`
    );
  }

  const done = rows.filter((r) => r.derived === 'done').length;
  console.log(`\n${done} of ${rows.length} tasks verified. ${mismatches} mismatch(es).`);

  if (full) {
    for (const [label, command] of [
      ['tests', ['npm', 'test']],
      ['build', ['npm', 'run', 'build']],
    ]) {
      let code = 0;
      try {
        execFileSync(command[0], command.slice(1), { cwd: ROOT, stdio: 'inherit' });
      } catch (error) {
        code = error.status ?? 1;
      }
      console.log(`${label}: exit ${code}`);
      if (code !== 0) mismatches += 1;
    }
  }

  return mismatches === 0 ? 0 : 1;
}

function cmdStatus(db) {
  const phases = db.prepare('SELECT * FROM phase ORDER BY seq').all();
  const tasks = tasksInOrder(db);
  const total = tasks.length;
  const done = tasks.filter((t) => latestStatus(db, t.id) === 'done').length;

  console.log(`PLAN  ${done}/${total} tasks verified, ${phases.length} phases`);
  for (const phase of phases) {
    const mine = tasks.filter((t) => t.phase_id === phase.id);
    const complete = mine.filter((t) => latestStatus(db, t.id) === 'done').length;
    const flag = complete === mine.length && mine.length > 0 ? 'done' : 'open';
    console.log(
      `  Phase ${phase.id.padEnd(3)} ${String(complete).padStart(2)}/${String(mine.length).padEnd(2)} ${flag.padEnd(5)} ${phase.name}`
    );
  }
  const next = tasks.find((t) => latestStatus(db, t.id) !== 'done');
  console.log(next ? `\nNext: ${next.id} — ${next.title}` : '\nEvery task is verified.');
  return 0;
}

function printSpec(db, task) {
  const spec = specOf(db, task.id);
  console.log(`\n${task.id} — ${task.title}   [phase ${task.phase_id}]`);
  if (!spec) {
    console.log('  (no spec recorded)');
    return;
  }
  const sections = [
    ['Files', spec.files],
    ['Steps', spec.steps],
    ['Out of scope', spec.out_of_scope],
    ['Verify', spec.verify],
    ['Commit', spec.commit_message],
  ];
  for (const [label, body] of sections) {
    if (!body || !body.trim()) continue;
    console.log(`\n${label}:`);
    console.log(
      body
        .trim()
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
    );
  }
  console.log(`\n  spec revision ${spec.id}, hash ${spec.content_hash}`);
}

function cmdNext(db) {
  const task = tasksInOrder(db).find((t) => latestStatus(db, t.id) !== 'done');
  if (!task) {
    console.log('Every task is verified.');
    return 0;
  }
  printSpec(db, task);
  return 0;
}

function cmdSpec(db, argv) {
  const id = argv[0];
  if (!id) {
    console.error('usage: plan spec <task-id>');
    return 2;
  }
  const rows = db.prepare('SELECT * FROM task WHERE id = ?').all(id);
  if (!rows[0]) {
    console.error(`no task ${id}`);
    return 2;
  }
  printSpec(db, rows[0]);
  return 0;
}

function cmdClaim(db, argv) {
  const [id, ...rest] = argv;
  const note = rest.join(' ').trim();
  if (!id || !note) {
    console.error('usage: plan claim <task-id> "<what you did>"');
    return 2;
  }
  if (!db.prepare('SELECT id FROM task WHERE id = ?').all(id)[0]) {
    console.error(`no task ${id}`);
    return 2;
  }
  db.prepare('INSERT INTO claim (task_id, note, created_at) VALUES (?, ?, ?)').run(id, note, now());
  console.log(`Claim recorded for ${id}. It is not a status — run 'plan verify'.`);
  return 0;
}

function cmdEvidence(db, argv) {
  const id = argv[0];
  const commandIndex = argv.indexOf('--command');
  const exitIndex = argv.indexOf('--exit');
  const command = commandIndex >= 0 ? argv[commandIndex + 1] : '';
  const exitCode = exitIndex >= 0 ? Number(argv[exitIndex + 1]) : null;
  if (!id || !command) {
    console.error('usage: plan evidence <task-id> --command "<cmd>" [--exit <n>] < output');
    return 2;
  }
  if (!db.prepare('SELECT id FROM task WHERE id = ?').all(id)[0]) {
    console.error(`no task ${id}`);
    return 2;
  }
  let output = '';
  try {
    output = readFileSync(0, 'utf8');
  } catch {
    output = '';
  }
  if (!output.trim()) {
    console.error('refusing to record empty output; pipe the real terminal output in');
    return 2;
  }
  db.prepare(
    'INSERT INTO evidence (task_id, command, exit_code, output, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, command, exitCode, output, now());
  console.log(`Evidence recorded for ${id} (${output.length} chars).`);
  return 0;
}

function cmdGate(db, argv) {
  const gates = argv[0]
    ? db.prepare('SELECT * FROM gate WHERE id = ?').all(argv[0])
    : db
        .prepare('SELECT gate.* FROM gate JOIN phase ON phase.id = gate.phase_id ORDER BY phase.seq')
        .all();
  const tasks = tasksInOrder(db);
  for (const gate of gates) {
    const mine = tasks.filter((t) => t.phase_id === gate.phase_id);
    const done = mine.filter((t) => latestStatus(db, t.id) === 'done').length;
    console.log(`\n${gate.id}  [${done}/${mine.length} tasks verified]`);
    for (const line of JSON.parse(gate.requirement)) console.log(`  - ${line}`);
  }
  return 0;
}

function cmdNote(db, argv) {
  if (!argv[0]) {
    const rows = db.prepare('SELECT slug, title, length(body) AS size FROM note ORDER BY slug').all();
    if (!rows.length) {
      console.log('No notes stored.');
      return 0;
    }
    for (const row of rows) console.log(`  ${row.slug.padEnd(16)} ${row.title}  (${row.size} chars)`);
    return 0;
  }
  const row = db.prepare('SELECT * FROM note WHERE slug = ?').all(argv[0])[0];
  if (!row) {
    console.error(`no note '${argv[0]}'`);
    return 2;
  }
  console.log(`${row.title}\n`);
  console.log(row.body);
  return 0;
}

/** A compact state block, small enough to inject into a prompt every turn. */
function cmdDump(db) {
  const tasks = tasksInOrder(db);
  const done = tasks.filter((t) => latestStatus(db, t.id) === 'done');
  const next = tasks.find((t) => latestStatus(db, t.id) !== 'done');
  const phases = db.prepare('SELECT * FROM phase ORDER BY seq').all();

  console.log(`PLAN STATE — ${done.length}/${tasks.length} tasks verified`);
  console.log(
    phases
      .map((p) => {
        const mine = tasks.filter((t) => t.phase_id === p.id);
        const n = mine.filter((t) => latestStatus(db, t.id) === 'done').length;
        return `${p.id}:${n}/${mine.length}`;
      })
      .join('  ')
  );
  if (next) {
    const spec = specOf(db, next.id);
    console.log(`\nNEXT  ${next.id} — ${next.title}`);
    if (spec) {
      console.log(`FILES ${spec.files.trim().replace(/\s+/g, ' ').slice(0, 400)}`);
      console.log(`VERIFY ${spec.verify.trim().replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }
  const recent = db
    .prepare('SELECT task_id, note FROM claim ORDER BY id DESC LIMIT 3')
    .all();
  if (recent.length) {
    console.log('\nRECENT CLAIMS');
    for (const row of recent) console.log(`  ${row.task_id}: ${row.note.slice(0, 120)}`);
  }
  const slugs = db.prepare('SELECT slug FROM note ORDER BY slug').all().map((r) => r.slug);
  if (slugs.length) {
    console.log(
      `\nRULES  npm run plan -- note execution-rules   (read before working)` +
        `\nNOTES  ${slugs.join(', ')}`
    );
  }
  return 0;
}

// ── import ───────────────────────────────────────────────────────────────────

/**
 * Read a plan written as markdown into the store.
 *
 * The parser is deliberately strict: a task that does not yield all five
 * sections is reported rather than silently stored half-formed, because a
 * partial import is indistinguishable from a complete one once the source is
 * gone.
 */
/**
 * The prose a plan carries besides its tasks: the rules work is done under, what
 * the product already does, the strategy, the parked decisions, the open
 * backlog. None of it parses into a task, and all of it is the reason the tasks
 * read the way they do, so it is stored rather than dropped.
 *
 * Headings are matched by their opening words. Status, board and log sections
 * are skipped: the store supersedes them.
 */
const NOTE_SECTIONS = [
  { match: 'how an agent uses', slug: 'how-to', title: 'How an agent uses the plan' },
  { match: 'execution rules', slug: 'execution-rules', title: 'Execution rules and definitions' },
  { match: 'what exists today', slug: 'product', title: 'What the product does today' },
  { match: 'strategy', slug: 'strategy', title: 'Strategy' },
  { match: 'candidate bets', slug: 'bets', title: 'Candidate bets — not authorised work' },
  { match: 'backlog', slug: 'backlog', title: 'Backlog — open deltas' },
  { match: 'appendix', slug: 'appendix', title: 'Notes for the executing model' },
];

function collectNotes(lines) {
  const found = [];
  let current = null;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      if (current) current.body.push(line);
      continue;
    }
    // Inside a fence a leading `##` is content, not structure. The evidence
    // template is a fenced block whose first line begins with two hashes, and
    // reading it as a heading closed the section it belonged to and discarded
    // the rest.
    if (fenced) {
      if (current) current.body.push(line);
      continue;
    }
    // Exactly two hashes. Allowing three swallowed every subsection: a `###`
    // heading opened a new section that matched nothing, and its body — the
    // Definitions, among others — was dropped on the floor.
    const heading = line.match(/^## (?:[0-9]+\.\s*)?([^#].*)$/);
    if (heading) {
      if (current) found.push(current);
      const label = heading[1].trim().toLowerCase();
      const section = NOTE_SECTIONS.find((entry) => label.startsWith(entry.match));
      current = section ? { ...section, body: [] } : null;
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) found.push(current);
  return found.map((entry) => ({ ...entry, body: entry.body.join('\n').trim() }));
}

function cmdImport(db, argv) {
  const path = argv[0];
  if (!path) {
    console.error('usage: plan import <markdown-file>');
    return 2;
  }
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const notes = collectNotes(lines);

  const phases = [];
  const tasks = [];
  const gates = [];
  let phase = null;
  let task = null;
  let gate = null;

  const flushTask = () => {
    if (task) tasks.push(task);
    task = null;
  };
  const flushGate = () => {
    if (gate) gates.push(gate);
    gate = null;
  };

  for (const line of lines) {
    const phaseMatch = line.match(/^# PHASE ([0-9A-Z]+) — (.+)$/);
    if (phaseMatch) {
      flushTask();
      flushGate();
      phase = { id: phaseMatch[1], name: phaseMatch[2].trim(), seq: phases.length, preamble: [] };
      phases.push(phase);
      continue;
    }
    const taskMatch = line.match(/^### Task ([0-9A-Z.]+) — (.+)$/);
    if (taskMatch && phase) {
      flushTask();
      flushGate();
      task = {
        id: taskMatch[1],
        title: taskMatch[2].trim(),
        phase_id: phase.id,
        seq: tasks.filter((t) => t.phase_id === phase.id).length,
        section: null,
        files: [],
        steps: [],
        out_of_scope: [],
        verify: [],
        commit_message: [],
      };
      continue;
    }
    const gateMatch = line.match(/^### (GATE [0-9A-Z]+) — /);
    if (gateMatch && phase) {
      flushTask();
      flushGate();
      gate = { id: gateMatch[1], phase_id: phase.id, requirement: [] };
      continue;
    }

    if (gate) {
      if (line.trim() === '---') {
        flushGate();
        continue;
      }
      const item = line.match(/^- \[ \] (.+)$/);
      if (item) {
        gate.requirement.push(item[1].trim());
      } else if (line.trim() && gate.requirement.length) {
        // An indented line under a checkbox continues it. Dropping these lost
        // half of what several gates actually require.
        gate.requirement[gate.requirement.length - 1] += ` ${line.trim()}`;
      }
      continue;
    }
    if (!task) {
      // Between a phase heading and its first task: the reasoning that explains
      // why the tasks under it are ordered the way they are.
      if (phase && !gates.some((g) => g.phase_id === phase.id)) phase.preamble.push(line);
      continue;
    }

    if (/^Files:/.test(line)) {
      task.section = 'files';
      task.files.push(line.replace(/^Files:\s*/, ''));
      continue;
    }
    if (/^Steps:/.test(line)) {
      task.section = 'steps';
      continue;
    }
    if (/^Out of scope:/.test(line)) {
      task.section = 'out_of_scope';
      task.out_of_scope.push(line.replace(/^Out of scope:\s*/, ''));
      continue;
    }
    if (/^Verify:/.test(line)) {
      task.section = 'verify';
      continue;
    }
    if (/^Commit:/.test(line)) {
      task.section = 'commit_message';
      task.commit_message.push(line.replace(/^Commit:\s*/, ''));
      continue;
    }
    if (task.section) task[task.section].push(line);
  }
  flushTask();
  flushGate();

  const stamp = now();
  db.exec('BEGIN');
  try {
    for (const item of phases) {
      db.prepare('INSERT OR REPLACE INTO phase (id, seq, name, purpose) VALUES (?, ?, ?, ?)').run(
        item.id,
        item.seq,
        item.name,
        item.preamble.join('\n').trim()
      );
    }
    for (const item of notes) {
      db.prepare('INSERT OR REPLACE INTO note (slug, title, body) VALUES (?, ?, ?)').run(
        item.slug,
        item.title,
        item.body
      );
    }
    for (const item of tasks) {
      db.prepare('INSERT OR REPLACE INTO task (id, phase_id, seq, title) VALUES (?, ?, ?, ?)').run(
        item.id,
        item.phase_id,
        item.seq,
        item.title
      );
      const body = ['files', 'steps', 'out_of_scope', 'verify', 'commit_message'].map((key) =>
        item[key].join('\n').trim()
      );
      db.prepare(
        `INSERT INTO spec_revision
           (task_id, files, steps, out_of_scope, verify, commit_message, content_hash, author, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(item.id, ...body, hash(body.join(' ')), 'import', stamp);
    }
    for (const item of gates) {
      db.prepare('INSERT OR REPLACE INTO gate (id, phase_id, requirement) VALUES (?, ?, ?)').run(
        item.id,
        item.phase_id,
        JSON.stringify(item.requirement)
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error(`import failed, nothing written: ${error.message}`);
    return 1;
  }

  const incomplete = tasks.filter((item) =>
    ['files', 'steps', 'verify', 'commit_message'].some((key) => !item[key].join('').trim())
  );
  console.log(
    `Imported ${phases.length} phases, ${tasks.length} tasks, ${gates.length} gates, ${notes.length} notes.`
  );
  if (incomplete.length) {
    console.log(`\nIncomplete specs (${incomplete.length}):`);
    for (const item of incomplete) {
      const missing = ['files', 'steps', 'verify', 'commit_message'].filter(
        (key) => !item[key].join('').trim()
      );
      console.log(`  ${item.id}: missing ${missing.join(', ')}`);
    }
    return 1;
  }
  return 0;
}

// ── entry ────────────────────────────────────────────────────────────────────

const USAGE = `plan — the execution plan and its progress

  plan status              where the plan stands
  plan next                the next unverified task, in full
  plan spec <task-id>      one task's contract
  plan gate [gate-id]      gate requirements and how close they are
  plan note [slug]         the rules, strategy and backlog the tasks assume
  plan claim <id> "<note>" record what you did; this is not a status
  plan evidence <id> --command "<cmd>" [--exit <n>] < output
  plan verify [--full]     derive status from the commit log; --full also runs the suite
  plan dump                compact state, for injecting into a prompt
  plan import <file>       read a markdown plan into the store

Only 'verify' writes a status. Everything else records what was claimed.`;

const COMMANDS = {
  status: cmdStatus,
  next: cmdNext,
  spec: cmdSpec,
  gate: cmdGate,
  note: cmdNote,
  claim: cmdClaim,
  evidence: cmdEvidence,
  verify: cmdVerify,
  dump: cmdDump,
  import: cmdImport,
};

function main() {
  const [name, ...argv] = process.argv.slice(2);
  if (!name || name === 'help' || name === '--help') {
    console.log(USAGE);
    return 0;
  }
  const handler = COMMANDS[name];
  if (!handler) {
    console.error(`unknown command '${name}'\n\n${USAGE}`);
    return 2;
  }
  const db = open();
  try {
    return handler(db, argv);
  } finally {
    db.close();
  }
}

process.exit(main());
