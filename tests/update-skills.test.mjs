import assert from "node:assert/strict";
import { mkdir, mkdtemp, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildAddArgs, linkOpenCodeSkills, resolveSkillPaths } from "../scripts/update-skills.mjs";

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
