import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const runner = path.resolve("skills/engineering/codex-local-review/scripts/local-preflight.mjs");

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
  });
}

async function git(repo, ...args) {
  const result = await run("git", ["-C", repo, ...args]);
  assert.equal(result.exitCode, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function createRepository({ candidate = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-local-review-test-"));
  const repo = path.join(root, "repo");
  await mkdir(repo);
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.name", "Test User");
  await git(repo, "config", "user.email", "test@example.com");
  await writeFile(path.join(repo, "file.txt"), "base\n");
  await writeFile(path.join(repo, ".gitignore"), "*.ignored\n");
  await git(repo, "add", "file.txt", ".gitignore");
  await git(repo, "commit", "-m", "base");
  const baseHead = await git(repo, "rev-parse", "HEAD");
  await git(repo, "switch", "-c", "ticket");
  if (candidate) {
    await writeFile(path.join(repo, "file.txt"), "base\ncandidate\n");
    await git(repo, "add", "file.txt");
    await git(repo, "commit", "-m", "candidate");
  }
  return {
    root,
    repo,
    baseHead,
    expectedHead: await git(repo, "rev-parse", "HEAD"),
  };
}

async function installFakeCodex(root) {
  const bin = path.join(root, "bin");
  const log = path.join(root, "codex-invocations.jsonl");
  await mkdir(bin);
  const executable = path.join(bin, "codex");
  await writeFile(executable, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex-cli 9.9.9");
  process.exit(0);
}

appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(args) + "\\n");
const mode = process.env.FAKE_CODEX_MODE || "success";
const worktree = args[args.indexOf("--cd") + 1];
if (mode === "auth") {
  console.error("Not logged in. Run codex login.");
  process.exit(1);
}
if (mode === "sandbox") {
  console.error("failed to initialize read-only sandbox");
  process.exit(1);
}
if (mode === "nonzero") {
  console.error("review process failed");
  process.exit(7);
}
if (mode === "malformed") {
  console.log("not-json");
  process.exit(0);
}
if (mode === "fatal-event") {
  console.log(JSON.stringify({ type: "error", message: "fatal Codex error" }));
  process.exit(0);
}
if (mode === "missing-output") {
  console.log(JSON.stringify({ type: "thread.started", thread_id: "test" }));
  console.log(JSON.stringify({ type: "turn.completed" }));
  process.exit(0);
}
if (mode === "mutate-status") {
  writeFileSync(new URL("codex-created.txt", "file://" + worktree + "/"), "mutation\\n");
}
if (mode === "mutate-ignored") {
  writeFileSync(new URL("codex-created.ignored", "file://" + worktree + "/"), "mutation\\n");
}
if (mode === "rewrite-ignored") {
  writeFileSync(new URL("baseline.ignored", "file://" + worktree + "/"), "rewritten\\n");
}
if (mode === "hide-tracked-mutation") {
  writeFileSync(new URL("file.txt", "file://" + worktree + "/"), "hidden mutation\\n");
  spawnSync("git", ["-C", worktree, "update-index", "--assume-unchanged", "file.txt"]);
}
if (mode === "mutate-head") {
  writeFileSync(new URL("codex-committed.txt", "file://" + worktree + "/"), "mutation\\n");
  spawnSync("git", ["-C", worktree, "add", "codex-committed.txt"]);
  spawnSync("git", ["-C", worktree, "commit", "--no-verify", "-m", "codex mutation"]);
}
console.log(JSON.stringify({ type: "thread.started", thread_id: "test" }));
console.log(JSON.stringify({ type: "turn.started" }));
if (mode === "warning") {
  console.log(JSON.stringify({
    type: "item.completed",
    item: { id: "warning_0", type: "error", message: "non-fatal config warning" },
  }));
}
console.log(JSON.stringify({
  type: "item.completed",
  item: {
    id: "item_0",
    type: "agent_message",
    text: "P1: preserve this finding\\n\\nP3: preserve this detail",
  },
}));
if (mode === "premature-eof") process.exit(0);
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 8 } }));
`);
  await chmod(executable, 0o755);
  return { bin, log };
}

async function invokeRunner(fixture, options = {}) {
  const fake = options.withCodex === false ? null : await installFakeCodex(fixture.root);
  const args = [
    runner,
    "--worktree", options.worktree ?? fixture.repo,
    "--base", options.base ?? "main",
    "--expected-head", options.expectedHead ?? fixture.expectedHead,
  ];
  const env = {
    ...process.env,
    PATH: fake ? `${fake.bin}${path.delimiter}${process.env.PATH}` : "/usr/bin:/bin",
    FAKE_CODEX_LOG: fake?.log,
    FAKE_CODEX_MODE: options.mode ?? "success",
  };
  const processResult = await run(process.execPath, args, { env });
  assert.equal(processResult.stderr, "");
  let outcome;
  assert.doesNotThrow(() => { outcome = JSON.parse(processResult.stdout); }, processResult.stdout);
  return { processResult, outcome, fake };
}

async function invocationCount(log) {
  try {
    return (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function withFixture(callback, options) {
  const fixture = await createRepository(options);
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

test("captures one isolated local review against the runner-computed merge base", async () => {
  await withFixture(async (fixture) => {
    const { processResult, outcome, fake } = await invokeRunner(fixture);

    assert.equal(processResult.exitCode, 0);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.codexVersion, "codex-cli 9.9.9");
    assert.equal(outcome.worktree, fixture.repo);
    assert.equal(outcome.base.reference, "main");
    assert.equal(outcome.base.resolvedHead, fixture.baseHead);
    assert.equal(outcome.mergeBase, fixture.baseHead);
    assert.equal(outcome.reviewedHead, fixture.expectedHead);
    assert.equal(outcome.reviewOutput, "P1: preserve this finding\n\nP3: preserve this detail");
    assert.equal(outcome.command.exitCode, 0);
    assert.equal(outcome.command.signal, null);
    assert.match(outcome.command.stdout, /item\.completed/);
    assert.equal(outcome.readOnly.verified, true);
    assert.deepEqual(outcome.readOnly.before, outcome.readOnly.after);
    assert.equal(await invocationCount(fake.log), 1);

    const args = outcome.command.args;
    assert.deepEqual(args.slice(0, 7), [
      "exec", "--sandbox", "read-only", "--ephemeral", "--json", "--config", "features.hooks=false",
    ]);
    assert.equal(args[7], "--cd");
    assert.equal(args[8], fixture.repo);
    assert.equal(args[9], "review");
    assert.match(args[10], new RegExp(`base reference: main`));
    assert.match(args[10], new RegExp(`resolved base SHA: ${fixture.baseHead}`));
    assert.match(args[10], new RegExp(`merge-base SHA: ${fixture.baseHead}`));
    assert.match(args[10], new RegExp(`expected HEAD: ${fixture.expectedHead}`));
    assert.match(args[10], /Do not load, invoke, or use any skills/i);
  });
});

test("blocks a worktree that is not a Git repository", async () => {
  await withFixture(async (fixture) => {
    const invalid = path.join(fixture.root, "not-a-repo");
    await mkdir(invalid);
    const { processResult, outcome, fake } = await invokeRunner(fixture, { worktree: invalid });
    assert.equal(processResult.exitCode, 1);
    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.blocker.code, "invalid_target");
    assert.equal(await invocationCount(fake.log), 0);
  });
});

test("blocks an unexpected HEAD", async () => {
  await withFixture(async (fixture) => {
    const { outcome, fake } = await invokeRunner(fixture, { expectedHead: fixture.baseHead });
    assert.equal(outcome.blocker.code, "unexpected_head");
    assert.equal(outcome.actualHead, fixture.expectedHead);
    assert.equal(await invocationCount(fake.log), 0);
  });
});

test("blocks untracked files as dirty worktree state", async () => {
  await withFixture(async (fixture) => {
    await writeFile(path.join(fixture.repo, "untracked.txt"), "dirty\n");
    const { outcome, fake } = await invokeRunner(fixture);
    assert.equal(outcome.blocker.code, "dirty_worktree");
    assert.match(outcome.blocker.evidence.status, /\?\? untracked\.txt/);
    assert.equal(await invocationCount(fake.log), 0);
  });
});

test("allows ignored files in the initial clean worktree state", async () => {
  await withFixture(async (fixture) => {
    await writeFile(path.join(fixture.repo, "baseline.ignored"), "ignored\n");
    const { processResult, outcome } = await invokeRunner(fixture);
    assert.equal(processResult.exitCode, 0);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.readOnly.before.status, "");
    assert.match(outcome.readOnly.before.completeStatus, /!! baseline\.ignored/);
    assert.deepEqual(outcome.readOnly.before, outcome.readOnly.after);
  });
});

test("blocks content changes to an existing ignored file", async () => {
  await withFixture(async (fixture) => {
    await writeFile(path.join(fixture.repo, "baseline.ignored"), "ignored\n");
    const { processResult, outcome } = await invokeRunner(fixture, { mode: "rewrite-ignored" });
    assert.equal(processResult.exitCode, 1);
    assert.equal(outcome.blocker.code, "repository_mutated");
    assert.equal(outcome.readOnly.statusUnchanged, true);
    assert.equal(outcome.readOnly.ignoredFilesUnchanged, false);
    assert.equal(outcome.readOnly.verified, false);
    assert.match(outcome.readOnly.before.completeStatus, /!! baseline\.ignored/);
    assert.equal(outcome.readOnly.before.completeStatus, outcome.readOnly.after.completeStatus);
    assert.notDeepEqual(outcome.readOnly.before.ignoredFiles, outcome.readOnly.after.ignoredFiles);
  });
});

for (const [flag, tag] of [
  ["--assume-unchanged", "h"],
  ["--skip-worktree", "S"],
]) {
  test(`blocks tracked changes hidden by ${flag}`, async () => {
    await withFixture(async (fixture) => {
      await git(fixture.repo, "update-index", flag, "file.txt");
      await writeFile(path.join(fixture.repo, "file.txt"), "hidden dirty state\n");
      assert.equal(await git(fixture.repo, "status", "--porcelain=v1"), "");

      const { processResult, outcome, fake } = await invokeRunner(fixture);
      assert.equal(processResult.exitCode, 1);
      assert.equal(outcome.blocker.code, "dirty_worktree");
      assert.deepEqual(outcome.blocker.evidence.hiddenIndexEntries, [`${tag} file.txt`]);
      assert.equal(await invocationCount(fake.log), 0);
    });
  });
}

test("blocks a missing base reference", async () => {
  await withFixture(async (fixture) => {
    const { outcome, fake } = await invokeRunner(fixture, { base: "missing-base" });
    assert.equal(outcome.blocker.code, "invalid_base");
    assert.equal(await invocationCount(fake.log), 0);
  });
});

test("blocks an empty merge diff", async () => {
  await withFixture(async (fixture) => {
    const { outcome, fake } = await invokeRunner(fixture);
    assert.equal(outcome.blocker.code, "empty_diff");
    assert.equal(await invocationCount(fake.log), 0);
  }, { candidate: false });
});

test("blocks when Codex is not installed", async () => {
  await withFixture(async (fixture) => {
    const { outcome } = await invokeRunner(fixture, { withCodex: false });
    assert.equal(outcome.blocker.code, "codex_missing");
    assert.equal(outcome.command.attempted, false);
  });
});

for (const [mode, blockerCode] of [
  ["auth", "authentication_failed"],
  ["sandbox", "sandbox_failed"],
  ["nonzero", "codex_failed"],
]) {
  test(`blocks ${mode} command failure`, async () => {
    await withFixture(async (fixture) => {
      const { processResult, outcome, fake } = await invokeRunner(fixture, { mode });
      assert.equal(processResult.exitCode, 1);
      assert.equal(outcome.blocker.code, blockerCode);
      assert.equal(outcome.command.attempted, true);
      assert.equal(outcome.readOnly.verified, true);
      assert.equal(await invocationCount(fake.log), 1);
    });
  });
}

test("blocks malformed JSON events", async () => {
  await withFixture(async (fixture) => {
    const { outcome } = await invokeRunner(fixture, { mode: "malformed" });
    assert.equal(outcome.blocker.code, "malformed_events");
    assert.equal(outcome.reviewOutput, null);
  });
});

test("blocks fatal Codex events", async () => {
  await withFixture(async (fixture) => {
    const { outcome } = await invokeRunner(fixture, { mode: "fatal-event" });
    assert.equal(outcome.blocker.code, "codex_event_error");
    assert.equal(outcome.blocker.evidence.event.type, "error");
  });
});

test("blocks valid events without terminal review output", async () => {
  await withFixture(async (fixture) => {
    const { outcome } = await invokeRunner(fixture, { mode: "missing-output" });
    assert.equal(outcome.blocker.code, "missing_terminal_output");
    assert.equal(outcome.reviewOutput, null);
  });
});

test("blocks premature EOF after an agent message", async () => {
  await withFixture(async (fixture) => {
    const { processResult, outcome } = await invokeRunner(fixture, { mode: "premature-eof" });
    assert.equal(processResult.exitCode, 1);
    assert.equal(outcome.blocker.code, "missing_terminal_output");
    assert.equal(outcome.reviewOutput, null);
    assert.match(outcome.command.stdout, /agent_message/);
    assert.doesNotMatch(outcome.command.stdout, /turn\.completed/);
  });
});

test("allows non-fatal Codex warning items before a completed review", async () => {
  await withFixture(async (fixture) => {
    const { processResult, outcome } = await invokeRunner(fixture, { mode: "warning" });
    assert.equal(processResult.exitCode, 0);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.blocker, null);
    assert.equal(outcome.reviewOutput, "P1: preserve this finding\n\nP3: preserve this detail");
    assert.match(outcome.command.stdout, /non-fatal config warning/);
  });
});

for (const mode of ["mutate-status", "mutate-ignored", "hide-tracked-mutation", "mutate-head"]) {
  test(`blocks repository ${mode} mutation after review`, async () => {
    await withFixture(async (fixture) => {
      const { outcome } = await invokeRunner(fixture, { mode });
      assert.equal(outcome.blocker.code, "repository_mutated");
      assert.equal(outcome.readOnly.verified, false);
      assert.notDeepEqual(outcome.readOnly.before, outcome.readOnly.after);
      assert.equal(outcome.reviewOutput, "P1: preserve this finding\n\nP3: preserve this detail");
      if (mode === "hide-tracked-mutation") {
        assert.equal(outcome.readOnly.statusUnchanged, true);
        assert.equal(outcome.readOnly.indexFlagsUnchanged, false);
      }
    });
  });
}
