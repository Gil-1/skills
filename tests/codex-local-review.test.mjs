import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const runner = path.resolve("skills/engineering/codex-local-review/scripts/local-preflight.mjs");

function run(command, args, options = {}) {
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
  await git(repo, "add", "file.txt");
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
  const executable = path.join(bin, process.platform === "win32" ? "codex.cmd" : "codex");
  const script = path.join(bin, "fake-codex.mjs");
  const source = `import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "--version") {
  console.log("codex-cli 9.9.9");
  process.exit(0);
}

const mode = process.env.FAKE_CODEX_MODE || "success";
const worktree = args[args.indexOf("--cd") + 1];
if (mode === "require-eof") {
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("end", resolve);
  });
}
if (mode === "nonzero") {
  console.error("review process failed");
  process.exit(7);
}
if (mode === "timeout") setInterval(() => {}, 1_000);
if (mode === "mutate-tracked") writeFileSync(path.join(worktree, "file.txt"), "mutated\\n");
if (mode === "mutate-untracked") writeFileSync(path.join(worktree, "created.txt"), "mutated\\n");
if (mode === "malformed") {
  console.log("not-json");
  process.exit(0);
}
if (mode === "missing-start") {
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "incomplete" } }));
  console.log(JSON.stringify({ type: "turn.completed" }));
  process.exit(0);
}

console.log(JSON.stringify({ type: "thread.started", thread_id: "test" }));
console.log(JSON.stringify({ type: "turn.started" }));
if (mode === "fatal") {
  console.log(JSON.stringify({ type: "turn.failed", error: { message: "fatal review failure" } }));
  process.exit(0);
}
console.log(JSON.stringify({
  type: "item.completed",
  item: { type: "agent_message", text: "P1: preserve this finding\\n\\nP3: preserve this detail" },
}));
if (mode === "incomplete") process.exit(0);
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 8 } }));
`;
  await writeFile(script, source);
  if (process.platform === "win32") {
    await writeFile(executable, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  } else {
    await writeFile(executable, `#!/usr/bin/env node\n${source}`);
  }
  await chmod(executable, 0o755);
  return { bin, log };
}

async function gitOnlyPath(root) {
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  let gitExecutable;
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `git${extension}`);
      try {
        await access(candidate);
        gitExecutable = candidate;
        break;
      } catch {
        // Continue searching PATH.
      }
    }
    if (gitExecutable) break;
  }
  assert.ok(gitExecutable, "Git must be available for the missing-Codex test");
  if (process.platform === "win32") return path.dirname(gitExecutable);
  const bin = path.join(root, "git-only-bin");
  await mkdir(bin);
  await symlink(gitExecutable, path.join(bin, "git"));
  return bin;
}

async function invokeRunner(fixture, options = {}) {
  const fake = options.withCodex === false ? null : await installFakeCodex(fixture.root);
  const executablePath = fake
    ? `${fake.bin}${path.delimiter}${process.env.PATH}`
    : await gitOnlyPath(fixture.root);
  const env = {
    ...process.env,
    PATH: executablePath,
    ...(options.mode ? { FAKE_CODEX_MODE: options.mode } : {}),
    ...options.env,
  };
  const result = await run(process.execPath, [
    runner,
    "--worktree", fixture.repo,
    "--base", options.base ?? "main",
    "--expected-head", options.expectedHead ?? fixture.expectedHead,
  ], { env });
  assert.equal(result.stderr, "");
  let outcome;
  assert.doesNotThrow(() => { outcome = JSON.parse(result.stdout); }, result.stdout);
  return { fake, outcome, result };
}

async function readInvocations(log) {
  try {
    return (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
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

test("runs one pinned read-only review and preserves its complete findings", async () => {
  await withFixture(async (fixture) => {
    const { fake, outcome, result } = await invokeRunner(fixture);

    assert.equal(result.exitCode, 0);
    assert.deepEqual(Object.keys(outcome), [
      "status", "worktree", "base", "mergeBase", "expectedHead", "reviewedHead",
      "codexVersion", "command", "readOnly", "reviewOutput", "blocker",
    ]);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.worktree, fixture.repo);
    assert.deepEqual(outcome.base, { reference: "main", resolvedHead: fixture.baseHead });
    assert.equal(outcome.mergeBase, fixture.baseHead);
    assert.equal(outcome.expectedHead, fixture.expectedHead);
    assert.equal(outcome.reviewedHead, fixture.expectedHead);
    assert.equal(outcome.codexVersion, "codex-cli 9.9.9");
    assert.equal(outcome.reviewOutput, "P1: preserve this finding\n\nP3: preserve this detail");
    assert.deepEqual(outcome.command, {
      attempted: true,
      exitCode: 0,
      signal: null,
      timedOut: false,
      timeoutMs: 30 * 60_000,
      stderr: "",
      error: null,
    });
    assert.deepEqual(outcome.readOnly.before, { head: fixture.expectedHead, status: "" });
    assert.deepEqual(outcome.readOnly.after, outcome.readOnly.before);
    assert.equal(outcome.readOnly.headUnchanged, true);
    assert.equal(outcome.readOnly.statusUnchanged, true);
    assert.equal(outcome.readOnly.verified, true);

    const invocations = await readInvocations(fake.log);
    assert.deepEqual(invocations[0], ["--version"]);
    assert.equal(invocations.filter(([command]) => command === "exec").length, 1);
    const reviewArgs = invocations[1];
    assert.deepEqual(reviewArgs.slice(0, 8), [
      "exec", "--sandbox", "read-only", "--ephemeral", "--json",
      "--config", "features.hooks=false", "--config",
    ]);
    assert.match(reviewArgs[8], /^developer_instructions=/);
    assert.deepEqual(reviewArgs.slice(9), [
      "--cd", fixture.repo, "review", "--base", fixture.baseHead,
    ]);
    const prompt = JSON.parse(reviewArgs[8].slice("developer_instructions=".length));
    assert.match(prompt, /base reference: main/);
    assert.match(prompt, new RegExp(`resolved base SHA: ${fixture.baseHead}`));
    assert.match(prompt, new RegExp(`merge-base SHA: ${fixture.baseHead}`));
    assert.match(prompt, new RegExp(`expected HEAD: ${fixture.expectedHead}`));
    assert.match(prompt, /Do not load or use any skills/i);
    assert.equal(reviewArgs.at(-1), fixture.baseHead);
    assert.equal(await git(fixture.repo, "status", "--porcelain"), "");
    assert.equal(await git(fixture.repo, "rev-parse", "HEAD"), fixture.expectedHead);
  });
});

test("closes Codex stdin before review", async () => {
  await withFixture(async (fixture) => {
    const { outcome, result } = await invokeRunner(fixture, {
      mode: "require-eof",
      env: { CODEX_LOCAL_REVIEW_TIMEOUT_MS: "500" },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(outcome.status, "passed");
    assert.equal(outcome.command.timedOut, false);
  });
});

for (const [name, dirty] of [
  ["tracked changes", async (repo) => writeFile(path.join(repo, "file.txt"), "dirty\n")],
  ["untracked files", async (repo) => writeFile(path.join(repo, "untracked.txt"), "dirty\n")],
]) {
  test(`blocks a worktree with ${name}`, async () => {
    await withFixture(async (fixture) => {
      await dirty(fixture.repo);
      const { fake, outcome, result } = await invokeRunner(fixture);
      assert.equal(result.exitCode, 1);
      assert.equal(outcome.blocker.code, "dirty_worktree");
      assert.notEqual(outcome.blocker.evidence.status, "");
      assert.deepEqual(await readInvocations(fake.log), []);
    });
  });
}

test("blocks an expected HEAD mismatch before review", async () => {
  await withFixture(async (fixture) => {
    const { fake, outcome, result } = await invokeRunner(fixture, { expectedHead: fixture.baseHead });
    assert.equal(result.exitCode, 1);
    assert.equal(outcome.blocker.code, "unexpected_head");
    assert.deepEqual(outcome.blocker.evidence, {
      expectedHead: fixture.baseHead,
      actualHead: fixture.expectedHead,
    });
    assert.deepEqual(await readInvocations(fake.log), []);
  });
});

test("blocks untracked files even when Git configuration hides them by default", async () => {
  await withFixture(async (fixture) => {
    await git(fixture.repo, "config", "status.showUntrackedFiles", "no");
    await writeFile(path.join(fixture.repo, "hidden-by-config.txt"), "dirty\n");
    const { fake, outcome, result } = await invokeRunner(fixture);
    assert.equal(result.exitCode, 1);
    assert.equal(outcome.blocker.code, "dirty_worktree");
    assert.match(outcome.blocker.evidence.status, /hidden-by-config\.txt/);
    assert.deepEqual(await readInvocations(fake.log), []);
  });
});

test("blocks an invalid base", async () => {
  await withFixture(async (fixture) => {
    const { fake, outcome } = await invokeRunner(fixture, { base: "missing-base" });
    assert.equal(outcome.blocker.code, "invalid_base");
    assert.deepEqual(await readInvocations(fake.log), []);
  });
});

test("blocks an empty merge-base-to-HEAD diff", async () => {
  await withFixture(async (fixture) => {
    const { fake, outcome } = await invokeRunner(fixture);
    assert.equal(outcome.blocker.code, "empty_diff");
    assert.deepEqual(await readInvocations(fake.log), []);
  }, { candidate: false });
});

test("blocks when Codex is missing", async () => {
  await withFixture(async (fixture) => {
    const { outcome, result } = await invokeRunner(fixture, { withCodex: false });
    assert.equal(result.exitCode, 1);
    assert.equal(outcome.blocker.code, "codex_missing");
    assert.equal(outcome.command.attempted, false);
  });
});

test("blocks a non-zero Codex review", async () => {
  await withFixture(async (fixture) => {
    const { fake, outcome, result } = await invokeRunner(fixture, { mode: "nonzero" });
    assert.equal(result.exitCode, 1);
    assert.equal(outcome.blocker.code, "codex_failed");
    assert.equal(outcome.command.exitCode, 7);
    assert.equal(outcome.command.stderr, "review process failed\n");
    assert.equal(outcome.readOnly.verified, true);
    assert.equal((await readInvocations(fake.log)).filter(([command]) => command === "exec").length, 1);
  });
});

for (const [mode, blockerCode] of [
  ["malformed", "malformed_events"],
  ["missing-start", "malformed_events"],
  ["incomplete", "incomplete_lifecycle"],
  ["fatal", "codex_event_error"],
]) {
  test(`blocks ${mode} Codex output`, async () => {
    await withFixture(async (fixture) => {
      const { outcome, result } = await invokeRunner(fixture, { mode });
      assert.equal(result.exitCode, 1);
      assert.equal(outcome.blocker.code, blockerCode);
      assert.equal(outcome.reviewOutput, null);
      assert.equal(outcome.readOnly.verified, true);
    });
  });
}

for (const mode of ["mutate-tracked", "mutate-untracked"]) {
  test(`blocks an ordinary ${mode.slice(7)} mutation after review`, async () => {
    await withFixture(async (fixture) => {
      const { outcome, result } = await invokeRunner(fixture, { mode });
      assert.equal(result.exitCode, 1);
      assert.equal(outcome.blocker.code, "repository_mutated");
      assert.equal(outcome.readOnly.verified, false);
      assert.equal(outcome.readOnly.statusUnchanged, false);
      assert.equal(outcome.reviewOutput, "P1: preserve this finding\n\nP3: preserve this detail");
    });
  });
}

test("times out a stalled Codex review", async () => {
  await withFixture(async (fixture) => {
    const startedAt = Date.now();
    const { outcome, result } = await invokeRunner(fixture, {
      mode: "timeout",
      env: { CODEX_LOCAL_REVIEW_TIMEOUT_MS: "50" },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(outcome.blocker.code, "codex_timeout");
    assert.equal(outcome.command.timedOut, true);
    assert.equal(outcome.command.timeoutMs, 50);
    assert.equal(outcome.readOnly.verified, true);
    assert.ok(Date.now() - startedAt < 5_000);
  });
});
