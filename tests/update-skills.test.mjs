import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAddArgs,
  collectStaleSkills,
  manifestSkillNames,
  pruneStaleSkills,
  resolveSkillPaths,
  sourceOwns,
  verifyInstallation,
} from "../scripts/update-skills.mjs";

const gilSource = {
  repository: "Gil-1/skills",
  names: ["review-fix"],
};
const mattSource = {
  repository: "mattpocock/skills",
  names: ["tdd"],
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("plugin manifest publishes every engineering skill and no in-progress skill", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"));
  const engineeringDir = new URL("../skills/engineering/", import.meta.url);
  const expected = [];

  for (const entry of await readdir(engineeringDir, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(new URL(`../skills/engineering/${entry.name}/SKILL.md`, import.meta.url)))) {
      expected.push(`./skills/engineering/${entry.name}`);
    }
  }

  assert.deepEqual([...manifest.skills].sort(), expected.sort());
  assert.equal(manifest.skills.some((skillPath) => skillPath.includes("/in-progress/")), false);
});

test("in-progress skills are internal", async () => {
  for (const skill of ["game-improvement-loop", "grill-with-docs-smarter"]) {
    const content = await readFile(new URL(`../skills/in-progress/${skill}/SKILL.md`, import.meta.url), "utf8");
    assert.match(content, /\nmetadata:\n\s+internal: true\n/);
  }
});

test("manifest skill names are validated", () => {
  assert.deepEqual(
    manifestSkillNames({ skills: ["./skills/engineering/review-fix"] }, "Gil-1/skills"),
    ["review-fix"],
  );
  assert.throws(
    () => manifestSkillNames({ skills: ["../skills/review-fix"] }, "Gil-1/skills"),
    /invalid published skill path/,
  );
});

test("add command targets Claude Code and Codex without wildcard discovery", () => {
  const args = buildAddArgs(gilSource);
  assert.deepEqual(args, [
    "--yes",
    "skills@1.5.19",
    "add",
    "Gil-1/skills",
    "-g",
    "--agent",
    "claude-code",
    "--agent",
    "codex",
    "--skill",
    "review-fix",
    "-y",
  ]);
  assert.equal(args.includes("*"), false);
  assert.equal(args.includes("--full-depth"), false);
  assert.equal(args.includes("--copy"), false);
});

test("stale collection is source-scoped", () => {
  const lock = {
    version: 3,
    skills: {
      "review-fix": { source: "Gil-1/skills" },
      "old-gil-skill": { sourceUrl: "https://github.com/Gil-1/skills.git" },
      tdd: { source: "mattpocock/skills" },
      "old-matt-skill": { source: "mattpocock/skills" },
      "third-party": { source: "someone/else" },
    },
  };

  assert.deepEqual(
    collectStaleSkills([gilSource, mattSource], lock).map(({ name }) => name),
    ["old-gil-skill", "old-matt-skill"],
  );
  assert.equal(sourceOwns(lock.skills["old-gil-skill"], "gil-1/skills"), true);
});

test("pruning removes only stale source-owned Claude and Codex skills", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "gil-skills-update-"));
  const env = {
    XDG_STATE_HOME: path.join(home, "state"),
    CLAUDE_CONFIG_DIR: path.join(home, "claude"),
    CODEX_HOME: path.join(home, "codex"),
  };
  const skillPaths = resolveSkillPaths({ env, home });
  const lock = {
    version: 3,
    skills: {
      "old-gil-skill": { source: "Gil-1/skills" },
      "third-party": { source: "someone/else" },
    },
    dismissed: {},
  };

  for (const root of [
    skillPaths.canonicalSkillsDir,
    skillPaths.claudeSkillsDir,
    skillPaths.legacyCodexSkillsDir,
  ]) {
    await mkdir(path.join(root, "old-gil-skill"), { recursive: true });
    await writeFile(path.join(root, "old-gil-skill", "SKILL.md"), "old");
  }
  await mkdir(path.join(skillPaths.canonicalSkillsDir, "third-party"), { recursive: true });
  await writeFile(path.join(skillPaths.canonicalSkillsDir, "third-party", "SKILL.md"), "keep");

  await pruneStaleSkills([{ name: "old-gil-skill", source: gilSource }], lock, skillPaths);

  assert.equal(await exists(path.join(skillPaths.canonicalSkillsDir, "old-gil-skill")), false);
  assert.equal(await exists(path.join(skillPaths.claudeSkillsDir, "old-gil-skill")), false);
  assert.equal(await exists(path.join(skillPaths.legacyCodexSkillsDir, "old-gil-skill")), false);
  assert.equal(await exists(path.join(skillPaths.canonicalSkillsDir, "third-party", "SKILL.md")), true);

  const savedLock = JSON.parse(await readFile(skillPaths.lockPath, "utf8"));
  assert.equal(savedLock.skills["old-gil-skill"], undefined);
  assert.deepEqual(savedLock.skills["third-party"], { source: "someone/else" });
});

test("verification rejects stale Claude Code content", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "gil-skills-verify-"));
  const skillPaths = resolveSkillPaths({
    env: { XDG_STATE_HOME: path.join(home, "state") },
    home,
  });
  const updatedAt = new Date().toISOString();
  const lock = {
    version: 3,
    skills: {
      "review-fix": {
        source: "Gil-1/skills",
        updatedAt,
      },
    },
    dismissed: {},
  };

  await mkdir(path.join(skillPaths.canonicalSkillsDir, "review-fix"), { recursive: true });
  await mkdir(path.join(skillPaths.claudeSkillsDir, "review-fix"), { recursive: true });
  await mkdir(path.dirname(skillPaths.lockPath), { recursive: true });
  await writeFile(path.join(skillPaths.canonicalSkillsDir, "review-fix", "SKILL.md"), "latest");
  await writeFile(path.join(skillPaths.claudeSkillsDir, "review-fix", "SKILL.md"), "latest");
  await writeFile(skillPaths.lockPath, JSON.stringify(lock));

  await verifyInstallation([gilSource], skillPaths, Date.parse(updatedAt) - 1);

  await writeFile(path.join(skillPaths.claudeSkillsDir, "review-fix", "SKILL.md"), "stale");
  await assert.rejects(
    verifyInstallation([gilSource], skillPaths, Date.parse(updatedAt) - 1),
    /Claude Code content differs/,
  );
});
