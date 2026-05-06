#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_IGNORES = [
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".env",
  ".envrc",
  ".secrets",
  "__pycache__",
  "credentials",
  "credentials.json",
  "secret",
  "secrets.json",
  "secrets",
];

const SENSITIVE_NAME_PREFIXES = [".env.", ".env-"];

const DOC_SIGNAL_NAMES = new Set([
  "agents.md",
  "claude.md",
  "context.md",
  "readme.md",
  "skill.md",
  "reference.md",
  "examples.md",
  "contributing.md",
  "architecture.md",
  "adr.md",
  "adrs.md",
  "design.md",
  "docs.md",
]);

const DOC_SIGNAL_DIRS = new Set(["docs", "doc", "adr", "adrs", "architecture", "design"]);

const TECH_SIGNAL_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "jsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "poetry.lock",
  "uv.lock",
  "go.mod",
  "cargo.toml",
  "gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "settings.gradle",
  "dockerfile",
  "docker-compose.yml",
  "angular.json",
  "astro.config.mjs",
  "svelte.config.js",
  "nuxt.config.ts",
  "remix.config.js",
  "tailwind.config.js",
  "schema.prisma",
]);

const TECH_SIGNAL_PREFIXES = [
  "next.config.",
  "vite.config.",
  "vitest.config.",
  "webpack.config.",
  "rollup.config.",
  "eslint.config.",
  "playwright.config.",
  "pytest.",
];

const GENERIC_FOLDER_NAMES = new Set([
  "common",
  "components",
  "core",
  "helpers",
  "lib",
  "misc",
  "services",
  "shared",
  "scripts",
  "utils",
]);

const GENERIC_FOLDER_THRESHOLD = 20;

function help() {
  return `Usage: structure-snapshot.mjs [options]

Read-only folder structure snapshot. Counts names only; never reads file contents.
Also reports documentation, framework, and generic-folder signals found by name.

Options:
  --root <path>              Root to scan (default: current directory)
  --max-depth <n>            Directory recursion depth (default: 3)
  --top <n>                  Number of crowded directories to show (default: 20)
  --max-entries-per-dir <n>  Stop counting a directory after this many entries (default: 5000)
  --ignore <name-or-path>    Extra basename or relative path to ignore; repeat or comma-separate
  --json                     Emit JSON instead of Markdown
  --help                     Show this help
`;
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    maxDepth: 3,
    top: 20,
    maxEntriesPerDir: 5000,
    json: false,
    ignore: new Set(DEFAULT_IGNORES),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      console.log(help());
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--root", "--max-depth", "--top", "--max-entries-per-dir", "--ignore"].includes(arg)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      i += 1;
      if (arg === "--root") options.root = value;
      if (arg === "--max-depth") options.maxDepth = parsePositiveInteger(arg, value);
      if (arg === "--top") options.top = parsePositiveInteger(arg, value);
      if (arg === "--max-entries-per-dir") options.maxEntriesPerDir = parsePositiveInteger(arg, value);
      if (arg === "--ignore") {
        for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
          options.ignore.add(normalizeRelative(item));
        }
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parsePositiveInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function shouldIgnore(entryName, relPath, ignore) {
  const normalized = normalizeRelative(relPath);
  return ignore.has(entryName) || ignore.has(normalized) || isSensitiveName(entryName);
}

function isSensitiveName(entryName) {
  const lowerName = entryName.toLowerCase();
  return SENSITIVE_NAME_PREFIXES.some((prefix) => lowerName.startsWith(prefix));
}

function isDocSignal(entryName, relPath, isDirectory) {
  const lowerName = entryName.toLowerCase();
  const lowerRel = normalizeRelative(relPath).toLowerCase();
  if (DOC_SIGNAL_NAMES.has(lowerName)) return true;
  if (isDirectory && DOC_SIGNAL_DIRS.has(lowerName)) return true;
  return lowerRel.endsWith("/context.md") || lowerRel.endsWith("/architecture.md");
}

function isTechSignal(entryName, relPath) {
  const lowerName = entryName.toLowerCase();
  const lowerRel = normalizeRelative(relPath).toLowerCase();
  if (TECH_SIGNAL_NAMES.has(lowerName)) return true;
  if (TECH_SIGNAL_PREFIXES.some((prefix) => lowerName.startsWith(prefix))) return true;
  return lowerRel.endsWith("/prisma/schema.prisma") || lowerRel.endsWith("/alembic.ini");
}

async function scanDir(absDir, rootDir, depth, options) {
  const rel = normalizeRelative(path.relative(rootDir, absDir)) || ".";
  const node = {
    path: rel,
    depth,
    directFiles: 0,
    directDirs: 0,
    scannedFiles: 0,
    scannedDirs: 0,
    directEntriesSeen: 0,
    truncated: false,
    errors: [],
    docSignals: [],
    techSignals: [],
    children: [],
  };

  let dir;
  try {
    dir = await fs.opendir(absDir);
  } catch (error) {
    node.errors.push(error.message);
    return node;
  }

  for await (const entry of dir) {
    node.directEntriesSeen += 1;
    if (node.directEntriesSeen > options.maxEntriesPerDir) {
      node.truncated = true;
      break;
    }

    const childRel = rel === "." ? entry.name : `${rel}/${entry.name}`;
    if (shouldIgnore(entry.name, childRel, options.ignore)) continue;

    if (isDocSignal(entry.name, childRel, entry.isDirectory())) node.docSignals.push(childRel);
    if (!entry.isDirectory() && isTechSignal(entry.name, childRel)) node.techSignals.push(childRel);

    if (entry.isDirectory()) {
      node.directDirs += 1;
      node.scannedDirs += 1;
      if (depth < options.maxDepth) {
        const child = await scanDir(path.join(absDir, entry.name), rootDir, depth + 1, options);
        node.children.push(child);
        node.scannedFiles += child.scannedFiles;
        node.scannedDirs += child.scannedDirs;
      }
    } else {
      node.directFiles += 1;
      node.scannedFiles += 1;
    }
  }

  return node;
}

function flatten(node, all = []) {
  all.push(node);
  for (const child of node.children) flatten(child, all);
  return all;
}

function row(values) {
  return `| ${values.join(" | ")} |`;
}

function renderMarkdown(result) {
  const directories = flatten(result.tree);
  const crowded = directories
    .filter((item) => item.path !== ".")
    .sort((a, b) => (b.directFiles + b.directDirs) - (a.directFiles + a.directDirs))
    .slice(0, result.options.top);
  const topLevel = result.tree.children.sort((a, b) => a.path.localeCompare(b.path));
  const warnings = directories.filter((item) => item.truncated || item.errors.length > 0);
  const docSignals = collectSignals(directories, "docSignals").slice(0, 40);
  const techSignals = collectSignals(directories, "techSignals").slice(0, 40);
  const genericSignals = directories
    .filter((item) => GENERIC_FOLDER_NAMES.has(path.basename(item.path)) && item.directFiles + item.directDirs >= GENERIC_FOLDER_THRESHOLD)
    .sort((a, b) => (b.directFiles + b.directDirs) - (a.directFiles + a.directDirs))
    .slice(0, 20);

  const lines = [
    "# Folder Structure Snapshot",
    "",
    `- Root: ${result.root}`,
    `- Max depth: ${result.options.maxDepth}`,
    `- Max entries per directory: ${result.options.maxEntriesPerDir}`,
    `- Ignored: ${Array.from(result.options.ignore).sort().join(", ")}`,
    "- Safety: file names counted only; file contents were not read.",
    "",
    "## Top-Level Map",
    row(["Path", "Direct dirs", "Direct files", "Scanned dirs", "Scanned files", "Notes"]),
    row(["---", "---:", "---:", "---:", "---:", "---"]),
  ];

  for (const item of topLevel) lines.push(formatNodeRow(item));

  lines.push("", "## Crowded Directories");
  lines.push(row(["Path", "Direct dirs", "Direct files", "Scanned dirs", "Scanned files", "Notes"]));
  lines.push(row(["---", "---:", "---:", "---:", "---:", "---"]));
  for (const item of crowded) lines.push(formatNodeRow(item));

  if (docSignals.length > 0 || techSignals.length > 0) {
    lines.push("", "## Documentation And Technology Signals");
    if (docSignals.length > 0) lines.push(`- Documentation candidates: ${docSignals.join(", ")}`);
    if (techSignals.length > 0) lines.push(`- Technology/framework candidates: ${techSignals.join(", ")}`);
  }

  if (genericSignals.length > 0) {
    lines.push("", "## Naming Review Signals");
    for (const item of genericSignals) {
      lines.push(`- ${item.path}: generic folder with ${item.directFiles + item.directDirs} direct entries`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const item of warnings) {
      const parts = [];
      if (item.truncated) parts.push("truncated");
      if (item.errors.length > 0) parts.push(`errors: ${item.errors.join("; ")}`);
      lines.push(`- ${item.path}: ${parts.join(", ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function collectSignals(directories, key) {
  return directories.flatMap((item) => item[key]).sort((a, b) => a.localeCompare(b));
}

function formatNodeRow(item) {
  const notes = [];
  if (item.truncated) notes.push("truncated");
  if (item.errors.length > 0) notes.push("errors");
  return row([
    item.path,
    String(item.directDirs),
    String(item.directFiles),
    String(item.scannedDirs),
    String(item.scannedFiles),
    notes.join(", ") || "",
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root);
  const tree = await scanDir(root, root, 0, options);
  const result = { root, options: { ...options, ignore: Array.from(options.ignore) }, tree };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderMarkdown(result));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
