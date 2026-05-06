#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const mattPocockDependencies = [
  "setup-matt-pocock-skills",
  "improve-codebase-architecture",
  "grill-me",
  "to-prd",
  "to-issues",
  "triage",
  "diagnose",
];

const usage = `Usage:
  node scripts/link-skills.mjs [options]

Options:
  --agent <name>        Agent to install for. Repeatable. Default: *
  --agents <list>       Comma-separated agents. Example: codex,claude-code
  --skill <name>        Local skill to install. Repeatable. Default: *
  --skills <list>       Comma-separated local skills.
  --source <path|repo>  Source for local skills. Default: this checkout.
  --project             Install to the current project instead of globally.
  --copy                Copy files instead of linking/symlinking.
  --skip-deps           Do not install Matt Pocock skill dependencies.
  --deps-only           Install only Matt Pocock skill dependencies.
  --dry-run             Print commands without running them.
  --help                Show this help.

Examples:
  node scripts/link-skills.mjs
  node scripts/link-skills.mjs --agents codex,claude-code
  node scripts/link-skills.mjs --skill project-folder-structure --agent codex
  node scripts/link-skills.mjs --project --skip-deps
`;

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    agents: ["*"],
    skills: ["*"],
    source: repoRoot,
    global: true,
    copy: false,
    installDependencies: true,
    depsOnly: false,
    dryRun: false,
  };

  let agentsWereSet = false;
  let skillsWereSet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }

    if (arg === "--project") {
      options.global = false;
      continue;
    }

    if (arg === "--copy") {
      options.copy = true;
      continue;
    }

    if (arg === "--skip-deps") {
      options.installDependencies = false;
      continue;
    }

    if (arg === "--deps-only") {
      options.depsOnly = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--source") {
      options.source = argv[++index];
      if (!options.source) fail("--source requires a value.");
      continue;
    }

    if (arg === "--agent") {
      const value = argv[++index];
      if (!value) fail("--agent requires a value.");
      if (!agentsWereSet) {
        options.agents = [];
        agentsWereSet = true;
      }
      options.agents.push(value);
      continue;
    }

    if (arg === "--agents") {
      const value = argv[++index];
      if (!value) fail("--agents requires a value.");
      options.agents = parseList(value);
      agentsWereSet = true;
      continue;
    }

    if (arg === "--skill") {
      const value = argv[++index];
      if (!value) fail("--skill requires a value.");
      if (!skillsWereSet) {
        options.skills = [];
        skillsWereSet = true;
      }
      options.skills.push(value);
      continue;
    }

    if (arg === "--skills") {
      const value = argv[++index];
      if (!value) fail("--skills requires a value.");
      options.skills = parseList(value);
      skillsWereSet = true;
      continue;
    }

    fail(`Unknown option: ${arg}`);
  }

  if (options.agents.length === 0) fail("At least one agent is required.");
  if (options.skills.length === 0) fail("At least one skill is required.");

  return options;
}

function fail(message) {
  console.error(message);
  console.error("");
  console.error(usage);
  process.exit(1);
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function buildAddArgs(source, { agents, skills, global, copy, fullDepth }) {
  const args = ["--yes", "skills@latest", "add", source];

  if (global) {
    args.push("-g");
  }

  for (const agent of agents) {
    args.push("-a", agent);
  }

  for (const skill of skills) {
    args.push("--skill", skill);
  }

  if (copy) {
    args.push("--copy");
  }

  if (fullDepth) {
    args.push("--full-depth");
  }

  args.push("-y");

  return args;
}

function run(label, args, dryRun) {
  const commandText = [npxCommand(), ...args].join(" ");
  console.log(`\n${label}`);
  console.log(commandText);

  if (dryRun) {
    return;
  }

  const result = spawnSync(npxCommand(), args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const options = parseArgs(process.argv.slice(2));

if (options.installDependencies) {
  run(
    "Installing Matt Pocock skill dependencies",
    buildAddArgs("mattpocock/skills", {
      ...options,
      skills: mattPocockDependencies,
      fullDepth: false,
    }),
    options.dryRun,
  );
}

if (!options.depsOnly) {
  run(
    "Linking local skills",
    buildAddArgs(options.source, {
      ...options,
      skills: options.skills,
      fullDepth: true,
    }),
    options.dryRun,
  );
}
