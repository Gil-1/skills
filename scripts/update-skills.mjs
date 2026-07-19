#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createNpxInvocation } from "./link-skills.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const agents = ["claude-code", "codex", "opencode"];
const skillsCli = "skills@1.5.19";
const sources = [
  {
    repository: "mattpocock/skills",
    inventoryUrl: "https://raw.githubusercontent.com/mattpocock/skills/main/.claude-plugin/plugin.json",
    skillNames: manifestSkillNames,
  },
  {
    repository: "Gil-1/skills",
    inventoryUrl: "https://api.github.com/repos/Gil-1/skills/git/trees/main?recursive=1",
    skillNames: gilStableSkillNames,
  },
];

const usage = `Usage:
  node scripts/update-skills.mjs [--dry-run]

Refreshes the published Matt Pocock and Gil skills for Claude Code, Codex, and OpenCode,
then removes skills those sources no longer publish.
`;

function parseArgs(argv) {
  const options = { dryRun: false };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function manifestSkillNames(manifest, repository) {
  const entries = typeof manifest.skills === "string" ? [manifest.skills] : manifest.skills;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${repository} has no published skills in its plugin manifest.`);
  }

  const names = entries.map((entry) => {
    if (typeof entry !== "string" || !entry.startsWith("./skills/")) {
      throw new Error(`${repository} has an invalid published skill path: ${String(entry)}`);
    }

    const name = path.posix.basename(entry.replace(/\/+$/, ""));
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
      throw new Error(`${repository} has an invalid published skill name: ${name}`);
    }
    return name;
  });

  if (new Set(names).size !== names.length) {
    throw new Error(`${repository} publishes duplicate skill names.`);
  }

  return names;
}

function gilStableSkillNames(tree, repository) {
  if (tree.truncated || !Array.isArray(tree.tree)) {
    throw new Error(`${repository} returned an incomplete repository tree.`);
  }

  return tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => String(entry.path).match(/^skills\/engineering\/([^/]+)\/SKILL\.md$/)?.[1])
    .filter(Boolean)
    .sort();
}

async function fetchPublishedSources() {
  return Promise.all(
    sources.map(async (source) => {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const response = await fetch(source.inventoryUrl, {
        headers: {
          "User-Agent": "gil-skills-update",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Unable to fetch ${source.inventoryUrl}: HTTP ${response.status}`);
      }

      const inventory = await response.json();
      const names = source.skillNames(inventory, source.repository);
      if (names.length === 0) throw new Error(`${source.repository} has no published skills.`);
      return { ...source, names };
    }),
  );
}

function normalizeRepository(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

function sourceOwns(entry, repository) {
  const expected = normalizeRepository(repository);
  return [entry?.source, entry?.sourceUrl].some((value) => normalizeRepository(value) === expected);
}

function resolveSkillPaths({ env = process.env, home = homedir() } = {}) {
  const stateHome = env.XDG_STATE_HOME || path.join(home, ".agents");
  return {
    lockPath: env.XDG_STATE_HOME
      ? path.join(stateHome, "skills", ".skill-lock.json")
      : path.join(stateHome, ".skill-lock.json"),
    canonicalSkillsDir: path.join(home, ".agents", "skills"),
    claudeSkillsDir: path.join(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "skills"),
    legacyCodexSkillsDir: path.join(env.CODEX_HOME || path.join(home, ".codex"), "skills"),
    opencodeSkillsDir: path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode", "skills"),
  };
}

async function readSkillLock(lockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (lock.version !== 3 || !lock.skills || typeof lock.skills !== "object") {
      throw new Error(`Unsupported skills lock format at ${lockPath}.`);
    }
    return lock;
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 3, skills: {}, dismissed: {} };
    throw error;
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assertNoPublishedNameCollisions(publishedSources) {
  const owners = new Map();
  for (const source of publishedSources) {
    for (const name of source.names) {
      const owner = owners.get(name);
      if (owner) {
        throw new Error(`${name} is published by both ${owner} and ${source.repository}.`);
      }
      owners.set(name, source.repository);
    }
  }
}

async function assertNoLocalOwnershipConflicts(publishedSources, lock, skillPaths) {
  for (const source of publishedSources) {
    for (const name of source.names) {
      const entry = lock.skills[name];
      if (entry && !sourceOwns(entry, source.repository)) {
        throw new Error(`${name} is already managed by ${entry.source ?? entry.sourceUrl ?? "another source"}.`);
      }

      if (!entry) {
        const installedPaths = [
          skillPaths.canonicalSkillsDir,
          skillPaths.claudeSkillsDir,
          skillPaths.opencodeSkillsDir,
        ].map((root) =>
          path.join(root, name),
        );
        if ((await Promise.all(installedPaths.map(pathExists))).some(Boolean)) {
          throw new Error(`${name} is installed without a matching source lock; refusing to overwrite it.`);
        }
      }
    }
  }
}

function collectStaleSkills(publishedSources, lock) {
  const stale = [];
  for (const source of publishedSources) {
    const published = new Set(source.names);
    for (const [name, entry] of Object.entries(lock.skills)) {
      if (sourceOwns(entry, source.repository) && !published.has(name)) {
        stale.push({ name, source });
      }
    }
  }
  return stale.sort((left, right) => left.name.localeCompare(right.name));
}

function buildAddArgs(source) {
  return [
    "--yes",
    skillsCli,
    "add",
    source.repository,
    "-g",
    ...agents.flatMap((agent) => ["--agent", agent]),
    ...source.names.flatMap((name) => ["--skill", name]),
    "-y",
  ];
}

function commandText(args) {
  return ["npx", ...args].map((arg) => (/^[A-Za-z0-9@%_+=:,./-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(" ");
}

function runNpx(args) {
  const invocation = createNpxInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with exit code ${result.status}: ${commandText(args)}`);
}

async function hashSkillDirectory(root) {
  const files = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        files.push({
          relativePath: path.relative(root, filePath).split(path.sep).join("/"),
          content: await readFile(filePath),
        });
      }
    }
  }

  await visit(root);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.content);
  }
  return hash.digest("hex");
}

async function verifyInstallation(publishedSources, skillPaths, startedAt) {
  const lock = await readSkillLock(skillPaths.lockPath);
  const failures = [];

  for (const source of publishedSources) {
    for (const name of source.names) {
      const entry = lock.skills[name];
      const canonicalDir = path.join(skillPaths.canonicalSkillsDir, name);
      const claudeDir = path.join(skillPaths.claudeSkillsDir, name);
      const opencodeDir = path.join(skillPaths.opencodeSkillsDir, name);
      const canonicalSkill = path.join(canonicalDir, "SKILL.md");
      const claudeSkill = path.join(claudeDir, "SKILL.md");
      const opencodeSkill = path.join(opencodeDir, "SKILL.md");
      if (!(await pathExists(canonicalSkill))) failures.push(`missing ${canonicalSkill}`);
      if (!(await pathExists(claudeSkill))) failures.push(`missing ${claudeSkill}`);
      if (!(await pathExists(opencodeSkill))) failures.push(`missing ${opencodeSkill}`);
      if (!sourceOwns(entry, source.repository)) failures.push(`wrong lock source for ${name}`);
      if (!(Date.parse(entry?.updatedAt) >= startedAt)) failures.push(`stale lock entry for ${name}`);
      if (
        (await pathExists(canonicalSkill))
        && (await pathExists(claudeSkill))
        && (await pathExists(opencodeSkill))
      ) {
        const [canonicalHash, claudeHash, opencodeHash] = await Promise.all([
          hashSkillDirectory(canonicalDir),
          hashSkillDirectory(claudeDir),
          hashSkillDirectory(opencodeDir),
        ]);
        if (canonicalHash !== claudeHash) failures.push(`Claude Code content differs for ${name}`);
        if (canonicalHash !== opencodeHash) failures.push(`OpenCode content differs for ${name}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Skill update verification failed:\n- ${failures.join("\n- ")}`);
  }
  return lock;
}

async function linkOpenCodeSkills(publishedSources, skillPaths) {
  await mkdir(skillPaths.opencodeSkillsDir, { recursive: true });

  for (const source of publishedSources) {
    for (const name of source.names) {
      const canonicalDir = path.join(skillPaths.canonicalSkillsDir, name);
      const opencodeDir = path.join(skillPaths.opencodeSkillsDir, name);
      await rm(opencodeDir, { recursive: true, force: true });
      await symlink(canonicalDir, opencodeDir, process.platform === "win32" ? "junction" : "dir");
    }
  }
}

async function reconcilePublishedSkillLinks(publishedSources, lock, skillPaths) {
  const canonicalSkillsDir = path.resolve(skillPaths.canonicalSkillsDir);
  const publishedNames = new Set(publishedSources.flatMap((source) => source.names));

  for (const root of [
    skillPaths.claudeSkillsDir,
    skillPaths.legacyCodexSkillsDir,
    skillPaths.opencodeSkillsDir,
  ]) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const linkPath = path.join(root, entry.name);
      const targetPath = path.resolve(root, await readlink(linkPath));
      if (path.dirname(targetPath) !== canonicalSkillsDir || publishedNames.has(entry.name)) continue;

      const lockEntry = lock.skills[entry.name];
      const ownedByManagedSource = publishedSources.some((source) => sourceOwns(lockEntry, source.repository));
      if ((lockEntry && !ownedByManagedSource) || (!lockEntry && (await pathExists(targetPath)))) continue;
      await rm(linkPath, { force: true });
    }
  }
}

async function writeSkillLock(lockPath, lock) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const temporaryPath = `${lockPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await rename(temporaryPath, lockPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function pruneStaleSkills(staleSkills, lock, skillPaths) {
  if (staleSkills.length === 0) return;

  for (const { name, source } of staleSkills) {
    const entry = lock.skills[name];
    if (!sourceOwns(entry, source.repository)) {
      throw new Error(`Refusing to prune ${name}; its lock ownership changed during the update.`);
    }

    for (const root of [
      skillPaths.canonicalSkillsDir,
      skillPaths.claudeSkillsDir,
      skillPaths.legacyCodexSkillsDir,
      skillPaths.opencodeSkillsDir,
    ]) {
      await rm(path.join(root, name), { recursive: true, force: true });
    }
    delete lock.skills[name];
  }

  await writeSkillLock(skillPaths.lockPath, lock);
}

async function updateSkills({ dryRun = false } = {}) {
  const publishedSources = await fetchPublishedSources();
  assertNoPublishedNameCollisions(publishedSources);

  const skillPaths = resolveSkillPaths();
  const lock = await readSkillLock(skillPaths.lockPath);
  await assertNoLocalOwnershipConflicts(publishedSources, lock, skillPaths);
  const staleSkills = collectStaleSkills(publishedSources, lock);

  for (const source of publishedSources) {
    console.log(`${source.repository}: ${source.names.length} published skill(s)`);
    console.log(commandText(buildAddArgs(source)));
  }
  if (staleSkills.length > 0) {
    console.log(`Stale source-owned skill(s) to remove: ${staleSkills.map(({ name }) => name).join(", ")}`);
  }
  if (dryRun) return;

  const startedAt = Date.now();
  for (const source of publishedSources) runNpx(buildAddArgs(source));

  await linkOpenCodeSkills(publishedSources, skillPaths);
  const updatedLock = await verifyInstallation(publishedSources, skillPaths, startedAt);
  await pruneStaleSkills(staleSkills, updatedLock, skillPaths);
  await reconcilePublishedSkillLinks(publishedSources, updatedLock, skillPaths);
  console.log("Claude Code, Codex, and OpenCode skills are synchronized.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  updateSkills(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { buildAddArgs, linkOpenCodeSkills, reconcilePublishedSkillLinks, resolveSkillPaths };
