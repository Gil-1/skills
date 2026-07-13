#!/usr/bin/env node

import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

const usage = `Usage: local-preflight.mjs --worktree <path> --base <ref> --expected-head <sha>

Run one isolated, read-only Codex review and emit one JSON outcome.`;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.code = "invalid_arguments";
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    if (!["--worktree", "--base", "--expected-head"].includes(arg)) {
      throw new InputError(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (!value) throw new InputError(`${arg} requires a value`);
    index += 1;
    if (arg === "--worktree") options.worktree = value;
    if (arg === "--base") options.base = value;
    if (arg === "--expected-head") options.expectedHead = value;
  }

  for (const [name, value] of Object.entries({
    "--worktree": options.worktree,
    "--base": options.base,
    "--expected-head": options.expectedHead,
  })) {
    if (!value) throw new InputError(`${name} is required`);
  }
  return options;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        error: { code: error.code ?? null, message: error.message },
      });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, signal, stdout, stderr, error: null });
    });
  });
}

async function git(worktree, args) {
  return runProcess("git", ["-C", worktree, ...args]);
}

function commandFailure(result) {
  return result.error?.message || result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
}

function createOutcome(options = {}) {
  return {
    schemaVersion: 1,
    status: "blocked",
    blocker: null,
    codexVersion: null,
    worktree: options.worktree ? path.resolve(options.worktree) : null,
    base: {
      reference: options.base ?? null,
      resolvedHead: null,
    },
    mergeBase: null,
    expectedHead: options.expectedHead ?? null,
    actualHead: null,
    reviewedHead: null,
    command: {
      attempted: false,
      executable: "codex",
      args: [],
      exitCode: null,
      signal: null,
      error: null,
      stdout: "",
      stderr: "",
    },
    readOnly: {
      before: null,
      after: null,
      headUnchanged: null,
      statusUnchanged: null,
      verified: false,
    },
    reviewOutput: null,
  };
}

function block(outcome, code, message, evidence = {}) {
  outcome.status = "blocked";
  outcome.blocker = { code, message, evidence };
  return outcome;
}

async function captureState(worktree) {
  const headResult = await git(worktree, ["rev-parse", "HEAD"]);
  if (headResult.exitCode !== 0) throw new Error(`Could not read HEAD: ${commandFailure(headResult)}`);
  const statusResult = await git(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (statusResult.exitCode !== 0) throw new Error(`Could not read worktree status: ${commandFailure(statusResult)}`);
  return {
    head: headResult.stdout.trim(),
    status: statusResult.stdout,
  };
}

function reviewInstructions(outcome) {
  return [
    "Review this pinned candidate using the Codex code-review rubric.",
    "Review target:",
    `- worktree: ${outcome.worktree}`,
    `- base reference: ${outcome.base.reference}`,
    `- resolved base SHA: ${outcome.base.resolvedHead}`,
    `- merge-base SHA: ${outcome.mergeBase}`,
    `- expected HEAD: ${outcome.expectedHead}`,
    `Review exactly the committed changes from ${outcome.mergeBase} through ${outcome.expectedHead}. Do not substitute another base or include uncommitted changes.`,
    "Do not load, invoke, or use any skills. Do not consult SKILL.md files or optional installed skill workflows. Normal repository instructions such as applicable AGENTS.md files still apply.",
    "This is review-only. Do not edit files, create commits, push, publish, or interact with GitHub.",
  ].join("\n");
}

function parseEvents(stdout) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return { error: `Invalid JSON event: ${line}` };
    }
    if (!event || Array.isArray(event) || typeof event !== "object" || typeof event.type !== "string") {
      return { error: `Invalid Codex event shape: ${line}` };
    }
    events.push(event);
  }
  return { events };
}

function terminalReviewOutput(events) {
  const outputIndex = events.findLastIndex((event) =>
    event.type === "item.completed"
      && event.item?.type === "agent_message"
      && typeof event.item.text === "string"
      && event.item.text.trim());
  if (outputIndex === -1) return null;

  const turnCompleted = events.slice(outputIndex + 1).some((event) => event.type === "turn.completed");
  return turnCompleted ? events[outputIndex].item.text : null;
}

function eventFailure(events) {
  return events.find((event) => event.type === "error" || event.type === "turn.failed" || event.item?.type === "error");
}

function commandBlocker(result) {
  const evidence = `${result.stdout}\n${result.stderr}`;
  if (/not logged in|log in|login required|authentication|unauthorized|api key|\b401\b/i.test(evidence)) {
    return ["authentication_failed", "Codex authentication failed."];
  }
  if (/sandbox|landlock|seccomp|read-only filesystem/i.test(evidence)) {
    return ["sandbox_failed", "Codex could not run in the required read-only sandbox."];
  }
  return ["codex_failed", "Codex review exited unsuccessfully."];
}

async function runPreflight(options) {
  const outcome = createOutcome(options);

  try {
    outcome.worktree = await realpath(outcome.worktree);
  } catch (error) {
    return block(outcome, "invalid_target", "The worktree path does not exist or cannot be resolved.", {
      error: error.message,
    });
  }

  const topLevelResult = await git(outcome.worktree, ["rev-parse", "--show-toplevel"]);
  if (topLevelResult.exitCode !== 0) {
    return block(outcome, "invalid_target", "The worktree is not a Git repository.", {
      error: commandFailure(topLevelResult),
    });
  }
  const topLevel = await realpath(topLevelResult.stdout.trim());
  if (topLevel !== outcome.worktree) {
    return block(outcome, "invalid_target", "The worktree must be the repository top level.", { topLevel });
  }

  const versionResult = await runProcess("codex", ["--version"]);
  if (versionResult.error?.code === "ENOENT") {
    return block(outcome, "codex_missing", "Codex CLI was not found on PATH.", versionResult.error);
  }
  if (versionResult.exitCode !== 0) {
    return block(outcome, "codex_unavailable", "Codex CLI version check failed.", {
      error: commandFailure(versionResult),
      exitCode: versionResult.exitCode,
    });
  }
  outcome.codexVersion = versionResult.stdout.trim() || versionResult.stderr.trim();

  let before;
  try {
    before = await captureState(outcome.worktree);
  } catch (error) {
    return block(outcome, "invalid_target", "Could not inspect the candidate repository.", { error: error.message });
  }
  outcome.actualHead = before.head;
  outcome.readOnly.before = before;

  if (before.head !== outcome.expectedHead) {
    return block(outcome, "unexpected_head", "The worktree HEAD does not exactly match expected HEAD.", {
      expectedHead: outcome.expectedHead,
      actualHead: before.head,
    });
  }
  if (before.status !== "") {
    return block(outcome, "dirty_worktree", "The worktree is not clean, including untracked files.", {
      status: before.status,
    });
  }

  const baseResult = await git(outcome.worktree, [
    "rev-parse", "--verify", "--quiet", "--end-of-options", `${outcome.base.reference}^{commit}`,
  ]);
  if (baseResult.exitCode !== 0) {
    return block(outcome, "invalid_base", "The base reference does not resolve to a commit.", {
      base: outcome.base.reference,
      error: commandFailure(baseResult),
    });
  }
  outcome.base.resolvedHead = baseResult.stdout.trim();

  const mergeBaseResult = await git(outcome.worktree, ["merge-base", outcome.base.resolvedHead, before.head]);
  if (mergeBaseResult.exitCode !== 0 || !mergeBaseResult.stdout.trim()) {
    return block(outcome, "invalid_base", "The base and expected HEAD do not have a merge base.", {
      error: commandFailure(mergeBaseResult),
    });
  }
  outcome.mergeBase = mergeBaseResult.stdout.trim();

  const diffResult = await git(outcome.worktree, ["diff", "--quiet", `${outcome.mergeBase}...${before.head}`, "--"]);
  if (diffResult.exitCode === 0) {
    return block(outcome, "empty_diff", "The merge diff is empty.", {
      mergeBase: outcome.mergeBase,
      expectedHead: before.head,
    });
  }
  if (diffResult.exitCode !== 1) {
    return block(outcome, "invalid_target", "The merge diff could not be inspected.", {
      error: commandFailure(diffResult),
    });
  }

  const args = [
    "exec",
    "--sandbox", "read-only",
    "--ephemeral",
    "--json",
    "--config", "hooks=[]",
    "--cd", outcome.worktree,
    "review",
    reviewInstructions(outcome),
  ];
  outcome.command.attempted = true;
  outcome.command.args = args;
  outcome.reviewedHead = before.head;
  const result = await runProcess("codex", args);
  Object.assign(outcome.command, result);

  let after;
  try {
    after = await captureState(outcome.worktree);
    outcome.readOnly.after = after;
    outcome.readOnly.headUnchanged = before.head === after.head;
    outcome.readOnly.statusUnchanged = before.status === after.status;
    outcome.readOnly.verified = outcome.readOnly.headUnchanged && outcome.readOnly.statusUnchanged;
  } catch (error) {
    return block(outcome, "postflight_verification_failed", "Repository state could not be verified after Codex ran.", {
      error: error.message,
    });
  }

  const parsed = parseEvents(result.stdout);
  if (!parsed.error) outcome.reviewOutput = terminalReviewOutput(parsed.events);

  if (!outcome.readOnly.verified) {
    return block(outcome, "repository_mutated", "Repository HEAD or complete worktree status changed during review.", {
      before,
      after,
    });
  }
  if (result.error?.code === "ENOENT") {
    return block(outcome, "codex_missing", "Codex CLI disappeared before review execution.", result.error);
  }
  if (result.error || result.exitCode !== 0 || result.signal) {
    const [code, message] = commandBlocker(result);
    return block(outcome, code, message, {
      exitCode: result.exitCode,
      signal: result.signal,
      error: result.error,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  if (parsed.error) {
    return block(outcome, "malformed_events", "Codex did not emit valid JSON events.", { error: parsed.error });
  }
  const failedEvent = eventFailure(parsed.events);
  if (failedEvent) {
    return block(outcome, "codex_event_error", "Codex emitted a failure event.", { event: failedEvent });
  }
  if (!outcome.reviewOutput) {
    return block(outcome, "missing_terminal_output", "Codex emitted no complete terminal review message.", {
      eventCount: parsed.events.length,
    });
  }

  outcome.status = "passed";
  outcome.blocker = null;
  return outcome;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const outcome = createOutcome();
    block(outcome, error.code ?? "invalid_arguments", error.message, { usage });
    console.log(JSON.stringify(outcome, null, 2));
    process.exitCode = 1;
    return;
  }

  let outcome;
  try {
    outcome = await runPreflight(options);
  } catch (error) {
    outcome = createOutcome(options);
    block(outcome, "runner_failed", "The local-preflight runner failed unexpectedly.", { error: error.message });
  }
  console.log(JSON.stringify(outcome, null, 2));
  process.exitCode = outcome.status === "passed" ? 0 : 1;
}

main();
