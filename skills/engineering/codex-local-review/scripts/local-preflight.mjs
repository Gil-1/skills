#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, copyFile, link, lstat, mkdtemp, readFile, readdir, readlink, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const usage = `Usage: local-preflight.mjs --worktree <path> --base <ref> --expected-head <sha>

Run one isolated, read-only Codex review and emit one JSON outcome.`;

const retainedEnvironmentNames = new Set([
  "ALL_PROXY", "CODEX_ACCESS_TOKEN", "CODEX_API_KEY", "CODEX_CA_CERTIFICATE", "CODEX_HOME",
  "COLORTERM", "COMSPEC", "HOME", "HOMEDRIVE", "HOMEPATH", "HTTP_PROXY", "HTTPS_PROXY",
  "LANG", "LANGUAGE", "LC_ADDRESS", "LC_ALL", "LC_COLLATE", "LC_CTYPE", "LC_IDENTIFICATION",
  "LC_MEASUREMENT", "LC_MESSAGES", "LC_MONETARY", "LC_NAME", "LC_NUMERIC", "LC_PAPER",
  "LC_TELEPHONE", "LC_TIME", "LOGNAME", "NO_COLOR", "NO_PROXY", "PATH", "PATHEXT",
  "SHELL", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMROOT", "TEMP", "TERM", "TMP", "TMPDIR",
  "TZ", "USER", "USERNAME", "USERPROFILE", "WINDIR",
]);

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
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (options.input !== undefined) child.stdin.end(options.input);
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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolveExecutable(name, env, excludedRoot) {
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const entry of (env[pathKey] ?? "").split(path.delimiter)) {
    const directory = path.resolve(entry || process.cwd());
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        const resolved = await realpath(candidate);
        if (!isWithin(excludedRoot, resolved)) return resolved;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return null;
}

async function sanitizedProcessEnvironment(worktree) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (retainedEnvironmentNames.has(name.toUpperCase())) env[name] = value;
  }
  env.GIT_OPTIONAL_LOCKS = "0";
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const safePath = [];
  for (const entry of (env[pathKey] ?? "").split(path.delimiter)) {
    if (!entry || !path.isAbsolute(entry)) continue;
    const lexicalPath = path.normalize(entry);
    let canonicalPath = lexicalPath;
    try {
      canonicalPath = await realpath(lexicalPath);
    } catch {
      // A missing PATH entry cannot currently supply an executable.
    }
    if (!isWithin(worktree, lexicalPath) && !isWithin(worktree, canonicalPath)) safePath.push(canonicalPath);
  }
  env[pathKey] = safePath.join(path.delimiter);

  const gitExecutable = await resolveExecutable("git", env, worktree);
  if (!gitExecutable) throw new Error("Git was not found outside the candidate worktree.");
  const result = await runProcess(gitExecutable, ["rev-parse", "--local-env-vars"], { env });
  if (result.exitCode !== 0) {
    throw new Error(`Could not identify Git-local environment variables: ${commandFailure(result)}`);
  }
  const names = result.stdout.split(/\r?\n/).filter(Boolean);
  if (names.length === 0 || names.some((name) => !/^GIT_[A-Z0-9_]+$/.test(name))) {
    throw new Error("Git returned an invalid local environment variable list.");
  }

  for (const name of names) delete env[name];
  return { env, gitExecutable };
}

async function git(worktree, args, env, gitExecutable) {
  return runProcess(gitExecutable, ["-C", worktree, ...args], { env });
}

async function isolatedCodexEnvironment(env, worktree) {
  const tempRoot = await realpath(os.tmpdir());
  if (isWithin(worktree, tempRoot)) {
    throw new Error("The temporary directory must be outside the candidate worktree.");
  }

  const codexHome = await mkdtemp(path.join(tempRoot, "codex-local-review-"));
  const callerCodexHome = path.resolve(env.CODEX_HOME || path.join(os.homedir(), ".codex"));
  const callerAuth = path.join(callerCodexHome, "auth.json");
  const isolatedAuth = path.join(codexHome, "auth.json");
  let authSnapshot = null;
  try {
    authSnapshot = await readFile(callerAuth);
    try {
      await link(callerAuth, isolatedAuth);
    } catch {
      await copyFile(callerAuth, isolatedAuth, constants.COPYFILE_EXCL);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      await rm(codexHome, { recursive: true, force: true });
      throw error;
    }
    authSnapshot = null;
  }
  return {
    codexHome,
    env: { ...env, CODEX_HOME: codexHome },
    authBridge: authSnapshot ? { callerAuth, isolatedAuth, authSnapshot } : null,
  };
}

async function persistAuthRefresh(authBridge) {
  if (!authBridge) return;
  const [callerAuth, isolatedAuth] = await Promise.all([
    readFile(authBridge.callerAuth),
    readFile(authBridge.isolatedAuth),
  ]);
  if (!isolatedAuth.equals(authBridge.authSnapshot) && callerAuth.equals(authBridge.authSnapshot)) {
    await copyFile(authBridge.isolatedAuth, authBridge.callerAuth);
  }
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
      indexFlagsUnchanged: null,
      trackedFilesUnchanged: null,
      ignoredFilesUnchanged: null,
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

async function captureState(worktree, env, gitExecutable) {
  const headResult = await git(worktree, ["rev-parse", "HEAD"], env, gitExecutable);
  if (headResult.exitCode !== 0) throw new Error(`Could not read HEAD: ${commandFailure(headResult)}`);
  const statusResult = await git(worktree, [
    "-c", "core.fileMode=true",
    "status", "--porcelain=v1", "--untracked-files=all", "--ignored", "--ignore-submodules=none",
  ], env, gitExecutable);
  if (statusResult.exitCode !== 0) throw new Error(`Could not read worktree status: ${commandFailure(statusResult)}`);
  const completeStatus = statusResult.stdout;
  const status = completeStatus
    .split(/(?<=\n)/)
    .filter((line) => !line.startsWith("!! "))
    .join("");
  const indexResult = await git(worktree, ["ls-files", "-v", "-z"], env, gitExecutable);
  if (indexResult.exitCode !== 0) throw new Error(`Could not inspect index flags: ${commandFailure(indexResult)}`);
  const hiddenIndexEntries = indexResult.stdout
    .split("\0")
    .filter((entry) => entry && (/^[a-z] /.test(entry) || entry.startsWith("S ")))
    .sort();
  const stagedResult = await git(worktree, ["ls-files", "--stage", "-z"], env, gitExecutable);
  if (stagedResult.exitCode !== 0) throw new Error(`Could not inspect tracked files: ${commandFailure(stagedResult)}`);
  const trackedFingerprint = createHash("sha256");
  const trackedMismatches = [];
  for (const entry of stagedResult.stdout.split("\0").filter(Boolean)) {
    const separator = entry.indexOf("\t");
    const metadata = separator === -1 ? [] : entry.slice(0, separator).split(" ");
    if (metadata.length !== 3 || !/^\d+$/.test(metadata[0]) || !/^[0-9a-f]+$/.test(metadata[1])) {
      throw new Error("Git returned an invalid tracked file entry.");
    }
    const [expectedMode, expectedOid, stage] = metadata;
    const relativePath = entry.slice(separator + 1);
    let actualMode = "missing";
    let canonicalOid = null;
    let worktreeDigest = null;
    try {
      const absolutePath = path.join(worktree, relativePath);
      const stats = await lstat(absolutePath);
      if (expectedMode === "160000" && stats.isDirectory()) {
        actualMode = "directory";
        const entries = await readdir(absolutePath);
        if (entries.length === 0) {
          actualMode = "160000";
          canonicalOid = expectedOid;
          worktreeDigest = "uninitialized";
        } else {
          const topLevelResult = await git(absolutePath, ["rev-parse", "--show-toplevel"], env, gitExecutable);
          if (topLevelResult.exitCode === 0
              && await realpath(topLevelResult.stdout.trim()) === await realpath(absolutePath)) {
            const submoduleHeadResult = await git(absolutePath, ["rev-parse", "--verify", "HEAD"], env, gitExecutable);
            const submoduleHead = submoduleHeadResult.stdout.trim();
            if (submoduleHeadResult.exitCode === 0 && /^[0-9a-f]+$/.test(submoduleHead)) {
              actualMode = "160000";
              canonicalOid = submoduleHead;
              worktreeDigest = `checkout:${submoduleHead}`;
            }
          }
        }
      } else if (stats.isSymbolicLink()) {
        actualMode = "120000";
        const target = await readlink(absolutePath);
        const hashResult = await runProcess(gitExecutable, ["hash-object", "--stdin"], { env, input: target });
        if (hashResult.exitCode !== 0) throw new Error(commandFailure(hashResult));
        canonicalOid = hashResult.stdout.trim();
        worktreeDigest = createHash("sha256").update(target).digest("hex");
      } else if (stats.isFile()) {
        actualMode = stats.mode & 0o111 ? "100755" : "100644";
        const hashResult = await git(worktree, ["hash-object", "--", relativePath], env, gitExecutable);
        if (hashResult.exitCode !== 0) throw new Error(commandFailure(hashResult));
        canonicalOid = hashResult.stdout.trim();
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
        worktreeDigest = hash.digest("hex");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const fingerprintEntry = { path: relativePath, expectedMode, expectedOid, stage, actualMode, canonicalOid, worktreeDigest };
    trackedFingerprint.update(`${JSON.stringify(fingerprintEntry)}\n`);
    if (stage !== "0" || actualMode !== expectedMode || canonicalOid !== expectedOid) {
      trackedMismatches.push({ path: relativePath, expectedMode, expectedOid, stage, actualMode, canonicalOid });
    }
  }
  const ignoredResult = await git(worktree, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], env, gitExecutable);
  if (ignoredResult.exitCode !== 0) throw new Error(`Could not list ignored files: ${commandFailure(ignoredResult)}`);
  const ignoredFiles = [];
  for (const relativePath of ignoredResult.stdout.split("\0").filter(Boolean).sort()) {
    const absolutePath = path.join(worktree, relativePath);
    const stats = await lstat(absolutePath);
    const hash = createHash("sha256");
    if (stats.isSymbolicLink()) {
      hash.update(await readlink(absolutePath));
    } else if (stats.isFile()) {
      for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
    }
    ignoredFiles.push({
      path: relativePath,
      mode: stats.mode,
      digest: hash.digest("hex"),
    });
  }
  return {
    head: headResult.stdout.trim(),
    status,
    completeStatus,
    hiddenIndexEntries,
    trackedFiles: {
      digest: trackedFingerprint.digest("hex"),
      mismatches: trackedMismatches,
    },
    ignoredFiles,
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
  return events.find((event) => event.type === "error" || event.type === "turn.failed");
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

  let processEnv;
  let gitExecutable;
  try {
    ({ env: processEnv, gitExecutable } = await sanitizedProcessEnvironment(outcome.worktree));
  } catch (error) {
    return block(outcome, "environment_failed", "Could not sanitize the subprocess environment.", {
      error: error.message,
    });
  }

  const topLevelResult = await git(outcome.worktree, ["rev-parse", "--show-toplevel"], processEnv, gitExecutable);
  if (topLevelResult.exitCode !== 0) {
    return block(outcome, "invalid_target", "The worktree is not a Git repository.", {
      error: commandFailure(topLevelResult),
    });
  }
  const topLevel = await realpath(topLevelResult.stdout.trim());
  if (topLevel !== outcome.worktree) {
    return block(outcome, "invalid_target", "The worktree must be the repository top level.", { topLevel });
  }

  const codexExecutable = await resolveExecutable("codex", processEnv, outcome.worktree);
  if (!codexExecutable) {
    return block(outcome, "codex_missing", "Codex CLI was not found on PATH.");
  }
  outcome.command.executable = codexExecutable;
  const versionResult = await runProcess(codexExecutable, ["--version"], { env: processEnv });
  if (versionResult.exitCode !== 0) {
    return block(outcome, "codex_unavailable", "Codex CLI version check failed.", {
      error: commandFailure(versionResult),
      exitCode: versionResult.exitCode,
    });
  }
  outcome.codexVersion = versionResult.stdout.trim() || versionResult.stderr.trim();

  let before;
  try {
    before = await captureState(outcome.worktree, processEnv, gitExecutable);
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
  if (before.hiddenIndexEntries.length > 0) {
    return block(outcome, "dirty_worktree", "Worktree cleanliness cannot be verified while tracked paths use hidden index flags.", {
      hiddenIndexEntries: before.hiddenIndexEntries,
    });
  }
  if (before.trackedFiles.mismatches.length > 0) {
    return block(outcome, "dirty_worktree", "Tracked worktree contents do not exactly match the index.", {
      trackedFiles: before.trackedFiles.mismatches,
    });
  }

  const baseResult = await git(outcome.worktree, [
    "rev-parse", "--verify", "--quiet", "--end-of-options", `${outcome.base.reference}^{commit}`,
  ], processEnv, gitExecutable);
  if (baseResult.exitCode !== 0) {
    return block(outcome, "invalid_base", "The base reference does not resolve to a commit.", {
      base: outcome.base.reference,
      error: commandFailure(baseResult),
    });
  }
  outcome.base.resolvedHead = baseResult.stdout.trim();

  const mergeBaseResult = await git(outcome.worktree, ["merge-base", outcome.base.resolvedHead, before.head], processEnv, gitExecutable);
  if (mergeBaseResult.exitCode !== 0 || !mergeBaseResult.stdout.trim()) {
    return block(outcome, "invalid_base", "The base and expected HEAD do not have a merge base.", {
      error: commandFailure(mergeBaseResult),
    });
  }
  outcome.mergeBase = mergeBaseResult.stdout.trim();

  const diffResult = await git(outcome.worktree, ["diff", "--quiet", `${outcome.mergeBase}...${before.head}`, "--"], processEnv, gitExecutable);
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
    "--ignore-user-config",
    "--ignore-rules",
    "--config", "features.hooks=false",
    "--config", "skills.include_instructions=false",
    "--config", "shell_environment_policy.inherit=\"none\"",
    "--config", `shell_environment_policy.set={ PATH = ${JSON.stringify(processEnv[Object.keys(processEnv).find((key) => key.toUpperCase() === "PATH") ?? "PATH"] ?? "")} }`,
    "--config", `projects.${JSON.stringify(outcome.worktree)}.trust_level="untrusted"`,
    "--cd", outcome.worktree,
    "review",
    reviewInstructions(outcome),
  ];
  outcome.command.args = args;
  outcome.reviewedHead = before.head;
  let isolated;
  try {
    isolated = await isolatedCodexEnvironment(processEnv, outcome.worktree);
  } catch (error) {
    return block(outcome, "environment_failed", "Could not isolate Codex authentication from caller instructions.", {
      error: error.message,
    });
  }

  outcome.command.attempted = true;
  let result;
  let cleanupError = null;
  try {
    result = await runProcess(codexExecutable, args, { env: isolated.env });
  } finally {
    try {
      await persistAuthRefresh(isolated.authBridge);
    } catch (error) {
      cleanupError = error;
    }
    try {
      await rm(isolated.codexHome, { recursive: true, force: true });
    } catch (error) {
      cleanupError ??= error;
    }
  }
  Object.assign(outcome.command, result);

  let after;
  try {
    after = await captureState(outcome.worktree, processEnv, gitExecutable);
    outcome.readOnly.after = after;
    outcome.readOnly.headUnchanged = before.head === after.head;
    outcome.readOnly.statusUnchanged = before.completeStatus === after.completeStatus;
    outcome.readOnly.indexFlagsUnchanged = JSON.stringify(before.hiddenIndexEntries) === JSON.stringify(after.hiddenIndexEntries);
    outcome.readOnly.trackedFilesUnchanged = JSON.stringify(before.trackedFiles) === JSON.stringify(after.trackedFiles);
    outcome.readOnly.ignoredFilesUnchanged = JSON.stringify(before.ignoredFiles) === JSON.stringify(after.ignoredFiles);
    outcome.readOnly.verified = outcome.readOnly.headUnchanged
      && outcome.readOnly.statusUnchanged
      && outcome.readOnly.indexFlagsUnchanged
      && outcome.readOnly.trackedFilesUnchanged
      && outcome.readOnly.ignoredFilesUnchanged;
  } catch (error) {
    return block(outcome, "postflight_verification_failed", "Repository state could not be verified after Codex ran.", {
      error: error.message,
    });
  }

  const parsed = parseEvents(result.stdout);
  if (!parsed.error) outcome.reviewOutput = terminalReviewOutput(parsed.events);

  if (!outcome.readOnly.verified) {
    return block(outcome, "repository_mutated", "Repository HEAD, complete worktree status, tracked file contents, hidden index flags, or ignored file contents changed during review.", {
      before,
      after,
    });
  }
  if (cleanupError) {
    return block(outcome, "environment_failed", "Could not finalize the isolated Codex authentication or home.", {
      error: cleanupError.message,
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
