import assert from "node:assert/strict";
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAddArgs,
  linkOpenCodeSkills,
  reconcilePublishedSkillLinks,
  resolveSkillPaths,
  topLevelSkillNames,
} from "../scripts/update-skills.mjs";

test("update installs skills for OpenCode", () => {
  const args = buildAddArgs({ repository: "Gil-1/skills", names: ["codex-pr-review"] });

  assert.deepEqual(args.slice(args.indexOf("-g") + 1, args.indexOf("--skill")), [
    "--agent",
    "claude-code",
    "--agent",
    "codex",
    "--agent",
    "opencode",
  ]);
});

test("update discovers only public top-level Lavish skills", () => {
  const names = topLevelSkillNames(
    {
      truncated: false,
      tree: [
        { type: "blob", path: "skills/lavish/SKILL.md" },
        { type: "blob", path: ".agents/skills/lavish-design/SKILL.md" },
        { type: "blob", path: "skills/lavish/README.md" },
      ],
    },
    "kunchenguid/lavish-axi",
  );

  assert.deepEqual(names, ["lavish"]);
});

test("update resolves the OpenCode skills directory from XDG_CONFIG_HOME", () => {
  const paths = resolveSkillPaths({
    env: { XDG_CONFIG_HOME: "/tmp/config" },
    home: "/tmp/home",
  });

  assert.equal(paths.opencodeSkillsDir, path.join("/tmp/config", "opencode", "skills"));
});

test("update replaces stale OpenCode copies with canonical links", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "skills-update-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const canonicalSkillsDir = path.join(root, "agents");
  const opencodeSkillsDir = path.join(root, "opencode");
  const canonicalDir = path.join(canonicalSkillsDir, "codex-pr-review");
  const staleDir = path.join(opencodeSkillsDir, "codex-pr-review");
  await mkdir(canonicalDir, { recursive: true });
  await mkdir(staleDir, { recursive: true });
  await writeFile(path.join(canonicalDir, "SKILL.md"), "current\n");
  await writeFile(path.join(staleDir, "SKILL.md"), "stale\n");

  await linkOpenCodeSkills(
    [{ names: ["codex-pr-review"] }],
    { canonicalSkillsDir, opencodeSkillsDir },
  );

  assert.equal(await readlink(staleDir), canonicalDir);
});

test("update removes local canonical links absent from the published inventories", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "skills-update-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const canonicalSkillsDir = path.join(root, "agents");
  const claudeSkillsDir = path.join(root, "claude");
  const staleLink = path.join(claudeSkillsDir, "stale-skill");
  const publishedLink = path.join(claudeSkillsDir, "published-skill");
  const otherSourceLink = path.join(claudeSkillsDir, "other-source-skill");
  const unrelatedLink = path.join(claudeSkillsDir, "unrelated-skill");
  const staleTarget = path.join(canonicalSkillsDir, "stale-skill");
  const publishedTarget = path.join(canonicalSkillsDir, "published-skill");
  const otherSourceTarget = path.join(canonicalSkillsDir, "other-source-skill");
  const unrelatedTarget = path.join(root, "external", "unrelated-skill");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await Promise.all([
    mkdir(staleTarget, { recursive: true }),
    mkdir(publishedTarget, { recursive: true }),
    mkdir(otherSourceTarget, { recursive: true }),
    mkdir(unrelatedTarget, { recursive: true }),
  ]);
  await mkdir(claudeSkillsDir, { recursive: true });
  await symlink(staleTarget, staleLink, linkType);
  await symlink(publishedTarget, publishedLink, linkType);
  await symlink(otherSourceTarget, otherSourceLink, linkType);
  await symlink(unrelatedTarget, unrelatedLink, linkType);
  await rm(staleTarget, { recursive: true, force: true });

  await reconcilePublishedSkillLinks(
    [{ repository: "Gil-1/skills", names: ["published-skill"] }],
    { skills: { "other-source-skill": { source: "someone-else/skills" } } },
    {
      canonicalSkillsDir,
      claudeSkillsDir,
      legacyCodexSkillsDir: path.join(root, "missing-codex"),
      opencodeSkillsDir: path.join(root, "missing-opencode"),
    },
  );

  await assert.rejects(readlink(staleLink), { code: "ENOENT" });
  assert.equal(await readlink(publishedLink), publishedTarget);
  assert.equal(await readlink(otherSourceLink), otherSourceTarget);
  assert.equal(await readlink(unrelatedLink), unrelatedTarget);
});
