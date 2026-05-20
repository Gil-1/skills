import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

const snapshotScript = path.resolve("skills/engineering/codebase-cleanup-audit/scripts/cleanup-snapshot.mjs");

async function runSnapshot(root) {
  const { stdout } = await execFileAsync(process.execPath, [snapshotScript, "--root", root, "--format", "json"]);
  return JSON.parse(stdout);
}

async function findScratchHtml(root, filePattern = /cleanup-snapshot\.html$/) {
  const scratchPath = path.join(root, ".scratch");
  const entries = await readdir(scratchPath);
  const fileName = entries.find((entry) => filePattern.test(entry));
  assert.ok(fileName, `expected a matching html report in ${scratchPath}`);
  assert.match(fileName, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-.+\.html$/);
  return path.join(scratchPath, fileName);
}

function findDuplicateFunctionGroup(snapshot, expected) {
  const expectedKeys = expected.map((item) => `${item.path}:${item.name}`).sort();

  return snapshot.duplicateFunctions.find((group) => {
    const actualKeys = group.occurrences.map((item) => `${item.path}:${item.name}`).sort();
    return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
  });
}

function findDuplicateFunctionNameGroup(snapshot, name) {
  return snapshot.duplicateFunctionNames.find((group) => group.name === name);
}

function findDuplicateFileNameGroup(snapshot, name) {
  return snapshot.duplicateFileNames.find((group) => group.name === name);
}

test("cleanup snapshot reports duplicate bodies and duplicate names for files and functions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-"));

  try {
    await mkdir(path.join(root, "current"));
    await mkdir(path.join(root, "legacy"));
    await writeFile(
      path.join(root, "alpha.mjs"),
      `
export function repeatedName(input) {
  const normalized = String(input).trim().toLowerCase();
  const segments = normalized.split(/[\\s_-]+/).filter(Boolean);
  const decorated = segments.map((segment, index) => \`\${index}:\${segment}\`);
  const joined = decorated.join("|");
  return joined.length > 0 ? joined : "empty";
}

export function copiedMetricBody(items) {
  const total = items.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
  const count = items.length || 1;
  const average = total / count;
  const rounded = Math.round(average * 100) / 100;
  return { total, count, average: rounded };
}

export function evolvingFormatter(value) {
  const text = String(value).trim();
  const pieces = text.split(/[\\s_-]+/).filter(Boolean);
  const capitalized = pieces.map((piece) => piece[0].toUpperCase() + piece.slice(1));
  const joined = capitalized.join(" ");
  return joined.length > 0 ? joined : "Untitled";
}

export const alphaOnly = "keeps whole files different";
`,
    );

    await writeFile(
      path.join(root, "beta.mjs"),
      `
export function repeatedName(input) {
  const normalized = String(input).trim().toLowerCase();
  const segments = normalized.split(/[\\s_-]+/).filter(Boolean);
  const decorated = segments.map((segment, index) => \`\${index}:\${segment}\`);
  const joined = decorated.join("|");
  return joined.length > 0 ? joined : "empty";
}

export function reusedMetricBody(items) {
  const total = items.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
  const count = items.length || 1;
  const average = total / count;
  const rounded = Math.round(average * 100) / 100;
  return { total, count, average: rounded };
}

export function evolvingFormatter(value) {
  const text = String(value).trim();
  const pieces = text.split(/[\\s_-]+/).filter(Boolean);
  const lowercase = pieces.map((piece) => piece.toLowerCase());
  const joined = lowercase.join("-");
  return joined.length > 0 ? joined : "untitled";
}

export const betaOnly = "keeps whole files different";
`,
    );

    await writeFile(path.join(root, "current", "config.json"), `{"feature":true,"limit":12}\n`);
    await writeFile(path.join(root, "legacy", "config.json"), `{"feature":true,"limit":12}\n`);
    await writeFile(path.join(root, "current", "settings.json"), `{"mode":"strict","retries":2}\n`);
    await writeFile(path.join(root, "legacy", "settings.json"), `{"mode":"compat","retries":5}\n`);

    const snapshot = await runSnapshot(root);
    const sameNameGroup = findDuplicateFunctionGroup(snapshot, [
      { path: "alpha.mjs", name: "repeatedName" },
      { path: "beta.mjs", name: "repeatedName" },
    ]);
    const differentNameGroup = findDuplicateFunctionGroup(snapshot, [
      { path: "alpha.mjs", name: "copiedMetricBody" },
      { path: "beta.mjs", name: "reusedMetricBody" },
    ]);
    const fullDuplicateNameGroup = findDuplicateFunctionNameGroup(snapshot, "repeatedName");
    const differentBodyNameGroup = findDuplicateFunctionNameGroup(snapshot, "evolvingFormatter");
    const fullDuplicateFileNameGroup = findDuplicateFileNameGroup(snapshot, "config.json");
    const differentContentFileNameGroup = findDuplicateFileNameGroup(snapshot, "settings.json");

    assert.ok(sameNameGroup, "expected a duplicate group for same function name and same body");
    assert.ok(differentNameGroup, "expected a duplicate group for different function names with the same body");
    assert.equal(new Set(sameNameGroup.occurrences.map((item) => item.name)).size, 1);
    assert.equal(new Set(differentNameGroup.occurrences.map((item) => item.name)).size, 2);
    assert.equal(fullDuplicateNameGroup?.status, "full-duplicate");
    assert.equal(fullDuplicateNameGroup?.variants, 1);
    assert.equal(differentBodyNameGroup?.status, "same-name-different-body");
    assert.equal(differentBodyNameGroup?.variants, 2);
    assert.equal(fullDuplicateFileNameGroup?.status, "full-duplicate");
    assert.equal(fullDuplicateFileNameGroup?.variants, 1);
    assert.equal(differentContentFileNameGroup?.status, "same-name-different-content");
    assert.equal(differentContentFileNameGroup?.variants, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup snapshot scopes results to the selected root directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-scope-"));

  try {
    const scopedRoot = path.join(root, "packages", "auth");
    await mkdir(path.join(scopedRoot, "src"), { recursive: true });
    await mkdir(path.join(root, "packages", "billing"), { recursive: true });
    await writeFile(path.join(scopedRoot, "src", "config.json"), `{"area":"auth"}\n`);
    await writeFile(path.join(scopedRoot, "src", "copy.json"), `{"area":"auth"}\n`);
    await writeFile(path.join(root, "packages", "billing", "config.json"), `{"area":"billing"}\n`);
    await writeFile(path.join(root, "packages", "billing", "copy.json"), `{"area":"billing"}\n`);

    const snapshot = await runSnapshot(scopedRoot);
    const allPaths = [
      ...snapshot.largestFiles.map((file) => file.path),
      ...snapshot.exactDuplicateFiles.flatMap((group) => group.paths),
      ...snapshot.duplicateFileNames.flatMap((group) => group.occurrences.map((occurrence) => occurrence.path)),
    ];

    assert.equal(snapshot.root, path.resolve(scopedRoot));
    assert.ok(snapshot.fileCount > 0);
    assert.ok(allPaths.every((item) => !item.includes("billing")));
    assert.ok(allPaths.every((item) => !item.includes("packages/auth")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup snapshot writes default html report under a scoped root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-scope-report-"));

  try {
    const scopedRoot = path.join(root, "apps", "admin");
    await mkdir(scopedRoot, { recursive: true });
    await writeFile(path.join(scopedRoot, "admin.js"), "export function admin() { return true; }\n");

    await execFileAsync(process.execPath, [snapshotScript, "--root", scopedRoot]);
    const report = await readFile(await findScratchHtml(scopedRoot), "utf8");

    assert.match(report, /Cleanup Snapshot/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup snapshot writes a default html report with limit warnings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-report-"));

  try {
    await writeFile(path.join(root, "one.js"), "export function one() { return 1; }\n");
    await writeFile(path.join(root, "two.js"), "export function two() { return 2; }\n");

    const { stdout } = await execFileAsync(process.execPath, [snapshotScript, "--root", root, "--max-files", "1"]);
    const reportPath = await findScratchHtml(root);
    const report = await readFile(reportPath, "utf8");

    assert.match(stdout, /cleanup-snapshot\.html/);
    assert.match(report, /<title>Cleanup Snapshot<\/title>/);
    assert.match(report, /Limit Warnings/);
    assert.match(report, /max-files-reached/);
    assert.match(report, /cleanup-snapshot-data/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup snapshot prefixes explicit .scratch html output with datetime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-custom-report-"));

  try {
    await writeFile(path.join(root, "one.js"), "export function one() { return 1; }\n");

    const requestedPath = path.join(root, ".scratch", "custom.html");
    const { stdout } = await execFileAsync(process.execPath, [snapshotScript, "--root", root, "--out", requestedPath]);
    const reportPath = await findScratchHtml(root, /custom\.html$/);
    const report = await readFile(reportPath, "utf8");

    assert.match(stdout, /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-custom\.html/);
    assert.notEqual(reportPath, requestedPath);
    assert.match(report, /Cleanup Snapshot/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup snapshot reports warnings when scan limits skip work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cleanup-snapshot-limits-"));

  try {
    await mkdir(path.join(root, "a"));
    await mkdir(path.join(root, "b"));
    await writeFile(path.join(root, "a", "dup.js"), "export function alpha() {\n  return 'larger than limit';\n}\n");
    await writeFile(path.join(root, "b", "dup.js"), "export function beta() {\n  return 'also larger than limit';\n}\n");

    const { stdout } = await execFileAsync(process.execPath, [
      snapshotScript,
      "--root",
      root,
      "--format",
      "json",
      "--out",
      "-",
      "--max-content-bytes",
      "5",
      "--max-function-bytes",
      "5",
      "--max-hash-bytes",
      "5",
    ]);
    const snapshot = JSON.parse(stdout);
    const warningCodes = new Set(snapshot.warnings.map((item) => item.code));

    assert.ok(warningCodes.has("max-content-bytes-skipped"));
    assert.ok(warningCodes.has("max-function-bytes-skipped"));
    assert.ok(warningCodes.has("max-hash-bytes-skipped"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
