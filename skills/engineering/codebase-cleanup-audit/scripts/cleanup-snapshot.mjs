#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ignoredDirs = new Set([
  ".git",
  ".hg",
  ".svn",
  ".scratch",
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".pytest_cache",
  "__pycache__",
  ".venv",
  "venv",
]);

const textExts = new Set([
  ".c",
  ".cc",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".kt",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const legacyPathPattern = /(^|[._\-/\\])(archive|bak|backup|copy|dead|deprecated|legacy|old|obsolete|tmp|unused|wip)([._\-/\\]|$)/i;
const contentPattern = /\b(TODO|FIXME|HACK|deprecated|legacy|unused|obsolete|dead code)\b/i;

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    format: "json",
    out: "",
    maxFiles: 50000,
    maxContentBytes: 256 * 1024,
    maxHashBytes: 1024 * 1024,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.root = argv[++i];
    else if (arg === "--format") options.format = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--max-files") options.maxFiles = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node cleanup-snapshot.mjs --root /path --format json|markdown [--out file]");
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!["json", "markdown"].includes(options.format)) {
    throw new Error("--format must be json or markdown");
  }

  options.root = path.resolve(options.root);
  return options;
}

async function walk(root, options) {
  const files = [];
  const dirs = [];

  async function visit(dir) {
    if (files.length >= options.maxFiles) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        dirs.push(relPath);
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const stat = await fs.stat(fullPath);
      files.push({
        path: relPath,
        name: entry.name,
        ext: path.extname(entry.name).toLowerCase() || "[none]",
        size: stat.size,
      });
    }
  }

  await visit(root);
  return { files, dirs };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

async function hashDuplicates(root, files, maxHashBytes) {
  const bySize = groupBy(
    files.filter((file) => file.size > 0 && file.size <= maxHashBytes),
    (file) => file.size,
  );
  const candidates = [...bySize.values()].filter((group) => group.length > 1).flat();
  const byHash = new Map();

  for (const file of candidates) {
    const buffer = await fs.readFile(path.join(root, file.path));
    const hash = createHash("sha256").update(buffer).digest("hex");
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(file.path);
  }

  return [...byHash.values()]
    .filter((group) => group.length > 1)
    .map((paths) => ({ paths }))
    .slice(0, 50);
}

async function scanContentSignals(root, files, options) {
  const hits = [];

  for (const file of files) {
    if (!textExts.has(file.ext) || file.size > options.maxContentBytes) continue;
    const content = await fs.readFile(path.join(root, file.path), "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (contentPattern.test(lines[i])) {
        hits.push({ path: file.path, line: i + 1, text: lines[i].trim().slice(0, 160) });
        break;
      }
    }
    if (hits.length >= 100) break;
  }

  return hits;
}

function summarizeExtensions(files) {
  return [...groupBy(files, (file) => file.ext).entries()]
    .map(([ext, group]) => ({
      ext,
      count: group.length,
      bytes: group.reduce((total, file) => total + file.size, 0),
    }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext));
}

function duplicateBasenames(files) {
  return [...groupBy(files, (file) => file.name.toLowerCase()).entries()]
    .filter(([, group]) => group.length > 1)
    .map(([name, group]) => ({ name, paths: group.map((file) => file.path).sort() }))
    .sort((a, b) => b.paths.length - a.paths.length || a.name.localeCompare(b.name))
    .slice(0, 100);
}

function toMarkdown(snapshot) {
  const lines = [];
  lines.push(`# Cleanup Snapshot`);
  lines.push("");
  lines.push(`Root: ${snapshot.root}`);
  lines.push(`Files: ${snapshot.fileCount}`);
  lines.push(`Directories: ${snapshot.dirCount}`);
  lines.push("");
  lines.push("## Extensions");
  for (const ext of snapshot.extensions.slice(0, 25)) {
    lines.push(`- ${ext.ext}: ${ext.count} files, ${ext.bytes} bytes`);
  }
  lines.push("");
  lines.push("## Legacy Path Signals");
  for (const item of snapshot.legacyPathSignals.slice(0, 50)) lines.push(`- ${item}`);
  if (snapshot.legacyPathSignals.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Duplicate Basenames");
  for (const item of snapshot.duplicateBasenames.slice(0, 30)) {
    lines.push(`- ${item.name}: ${item.paths.join(", ")}`);
  }
  if (snapshot.duplicateBasenames.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Exact Duplicate Files");
  for (const item of snapshot.exactDuplicateFiles.slice(0, 30)) lines.push(`- ${item.paths.join(", ")}`);
  if (snapshot.exactDuplicateFiles.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Content Signals");
  for (const hit of snapshot.contentSignals.slice(0, 50)) {
    lines.push(`- ${hit.path}:${hit.line} ${hit.text}`);
  }
  if (snapshot.contentSignals.length === 0) lines.push("- none found");
  lines.push("");
  lines.push("## Largest Files");
  for (const file of snapshot.largestFiles) lines.push(`- ${file.path}: ${file.size} bytes`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { files, dirs } = await walk(options.root, options);
  const snapshot = {
    root: options.root,
    fileCount: files.length,
    dirCount: dirs.length,
    extensions: summarizeExtensions(files),
    legacyPathSignals: files.map((file) => file.path).filter((filePath) => legacyPathPattern.test(filePath)).sort(),
    duplicateBasenames: duplicateBasenames(files),
    exactDuplicateFiles: await hashDuplicates(options.root, files, options.maxHashBytes),
    contentSignals: await scanContentSignals(options.root, files, options),
    largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 25),
  };

  const output = options.format === "markdown" ? toMarkdown(snapshot) : `${JSON.stringify(snapshot, null, 2)}\n`;
  if (options.out) {
    await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await fs.writeFile(options.out, output);
  } else {
    process.stdout.write(output);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
