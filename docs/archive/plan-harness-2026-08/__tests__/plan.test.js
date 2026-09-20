/**
 * @jest-environment node
 */

const { execFileSync } = require('child_process');
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const CLI = join(__dirname, '..', 'plan.mjs');

const PLAN = `# PHASE 0 — Rails

### Task 0.1 — Record the baseline
Files: none (read-only).
Steps:
1. Run the three commands.
Out of scope: fixing anything.
Verify:
- \`npm test\` → 0 failed
Commit: none (no changes).

### Task 0.2 — Record the baseline as evidence
Files: none.
Steps:
1. Pipe each command's output into the store.
Out of scope: any source file.
Verify:
- \`npm run plan -- verify\` → exit 0
Commit: \`chore(0.2): record baseline evidence\`

### GATE 0 — do not start Phase 1 until:
- [ ] Baseline recorded
- [ ] \`git status --short\` is clean
      and nothing untracked remains

---

# PHASE 1 — Do the work

### Task 1.1 — First real task
Files: \`src/thing.ts\` (new).
Steps:
1. Write the thing.
Out of scope: everything else.
Verify:
- \`npm test -- thing\` → 0 failed
Commit: \`feat(1.1): the thing\`

### GATE 1 — do not start Phase 2 until:
- [ ] Suite green

---
`;

/** A scratch workspace: an empty git repo plus its own plan store. */
function makeWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'plan-test-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'chore: seed'], { cwd: dir });

  const planPath = join(dir, 'plan.md');
  writeFileSync(planPath, PLAN);
  mkdirSync(join(dir, 'store'), { recursive: true });

  return { dir, planPath, db: join(dir, 'store', 'state.db') };
}

function run(workspace, args, input) {
  const result = require('child_process').spawnSync('node', [CLI, ...args], {
    cwd: workspace.dir,
    encoding: 'utf8',
    input: input === undefined ? '' : input,
    env: { ...process.env, PLAN_DB: workspace.db, PLAN_GIT_ROOT: workspace.dir },
  });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

function commit(workspace, subject) {
  writeFileSync(join(workspace.dir, `f-${Math.random().toString(36).slice(2)}.txt`), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: workspace.dir });
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: workspace.dir });
}

describe('plan store', () => {
  let workspace;

  beforeEach(() => {
    workspace = makeWorkspace();
    const imported = run(workspace, ['import', workspace.planPath]);
    expect(imported.code).toBe(0);
  });

  afterEach(() => {
    rmSync(workspace.dir, { recursive: true, force: true });
  });

  it('imports every phase, task and gate', () => {
    const status = run(workspace, ['status']);
    expect(status.code).toBe(0);
    expect(status.out).toContain('0/3 tasks verified, 2 phases');
    expect(status.out).toContain('Next: 0.1');
  });

  it('keeps a gate requirement that spans several lines', () => {
    const gate = run(workspace, ['gate', 'GATE 0']);
    expect(gate.out).toContain('and nothing untracked remains');
  });

  it('stores the full spec for a task', () => {
    const spec = run(workspace, ['spec', '1.1']);
    expect(spec.out).toContain('src/thing.ts');
    expect(spec.out).toContain('feat(1.1): the thing');
    expect(spec.out).toMatch(/spec revision \d+, hash [0-9a-f]{16}/);
  });

  it('records a claim without granting a status', () => {
    const claimed = run(workspace, ['claim', '1.1', 'finished']);
    expect(claimed.code).toBe(0);
    expect(claimed.out).toContain('not a status');

    const status = run(workspace, ['status']);
    expect(status.out).toContain('0/3 tasks verified');
  });

  it('refuses empty evidence', () => {
    const recorded = run(workspace, ['evidence', '1.1', '--command', 'npm test'], '   \n');
    expect(recorded.code).toBe(2);
    expect(recorded.err).toContain('refusing to record empty output');
  });

  it('marks a claim with no commit as a mismatch and exits non-zero', () => {
    run(workspace, ['claim', '1.1', 'finished']);
    const verified = run(workspace, ['verify']);
    expect(verified.out).toContain('MISMATCH');
    expect(verified.out).toContain('no commit carries this id');
    expect(verified.code).toBe(1);
  });

  it('derives done from a commit plus recorded evidence', () => {
    commit(workspace, 'feat(1.1): the thing');
    run(workspace, ['evidence', '1.1', '--command', 'npm test -- thing', '--exit', '0'], 'Tests: 4 passed\n');

    const verified = run(workspace, ['verify']);
    expect(verified.code).toBe(0);
    expect(verified.out).not.toContain('MISMATCH');
    expect(run(workspace, ['status']).out).toContain('1/3 tasks verified');
  });

  it('treats a commit with no recorded evidence as a mismatch', () => {
    commit(workspace, 'feat(1.1): the thing');
    const verified = run(workspace, ['verify']);
    expect(verified.out).toContain('no verify output recorded');
    expect(verified.code).toBe(1);
  });

  it('rejects two non-fix commits carrying one task id', () => {
    commit(workspace, 'feat(1.1): the thing');
    commit(workspace, 'feat(1.1): the thing again');
    run(workspace, ['evidence', '1.1', '--command', 'npm test', '--exit', '0'], 'ok\n');

    const verified = run(workspace, ['verify']);
    expect(verified.out).toContain('2 non-fix commits carry this id');
    expect(verified.code).toBe(1);
  });

  it('accepts one primary commit alongside any number of fix commits', () => {
    commit(workspace, 'feat(1.1): the thing');
    commit(workspace, 'fix(1.1): a follow-up');
    commit(workspace, 'fix(1.1): another follow-up');
    run(workspace, ['evidence', '1.1', '--command', 'npm test', '--exit', '0'], 'ok\n');

    const verified = run(workspace, ['verify']);
    expect(verified.code).toBe(0);
    expect(verified.out).not.toContain('MISMATCH');
  });

  it('verifies a no-commit task on its evidence alone', () => {
    run(workspace, ['evidence', '0.1', '--command', 'npm test', '--exit', '0'], 'Tests: 9 passed\n');
    const verified = run(workspace, ['verify']);
    expect(verified.code).toBe(0);
    expect(verified.out).toContain('no commit required');
  });

  it('leaves an untouched task as todo without calling it a mismatch', () => {
    const verified = run(workspace, ['verify']);
    expect(verified.code).toBe(0);
    expect(verified.out).toContain('0 mismatch(es)');
  });

  it('dumps a compact state block naming the next task', () => {
    const dumped = run(workspace, ['dump']);
    expect(dumped.code).toBe(0);
    expect(dumped.out).toContain('PLAN STATE — 0/3 tasks verified');
    expect(dumped.out).toContain('NEXT  0.1');
  });

  it('rejects a claim or evidence for a task that does not exist', () => {
    expect(run(workspace, ['claim', '9.9', 'done']).code).toBe(2);
    expect(run(workspace, ['evidence', '9.9', '--command', 'x'], 'out\n').code).toBe(2);
  });
});
