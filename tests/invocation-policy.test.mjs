import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const engineeringDir = path.resolve("skills/engineering");
const userOnlySkills = new Set(["handle-tickets"]);

async function publishedSkillDirectories() {
  const entries = await readdir(engineeringDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  return (
    await Promise.all(
      directories.map(async (entry) => {
        const directory = path.join(engineeringDir, entry.name);
        const files = await readdir(directory);
        return files.includes("SKILL.md") ? directory : null;
      }),
    )
  ).filter(Boolean);
}

function frontmatter(skill) {
  const match = skill.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, "expected SKILL.md YAML frontmatter");
  return match[1];
}

test("published engineering skills match their Claude and OpenAI invocation policies", async () => {
  const skillDirectories = await publishedSkillDirectories();
  assert.ok(skillDirectories.length > 0, "expected published engineering skills");
  const skillNames = new Set(skillDirectories.map((directory) => path.basename(directory)));

  for (const skillName of userOnlySkills) {
    assert.ok(skillNames.has(skillName), `expected published skill ${skillName}`);
  }

  await Promise.all(
    skillDirectories.map(async (skillDirectory) => {
      const skillName = path.basename(skillDirectory);
      const expectedUserOnly = userOnlySkills.has(skillName);
      const [skill, openai] = await Promise.all([
        readFile(path.join(skillDirectory, "SKILL.md"), "utf8"),
        readFile(path.join(skillDirectory, "agents/openai.yaml"), "utf8"),
      ]);

      const hasClaudeFlag = /^disable-model-invocation: true$/m.test(frontmatter(skill));
      const hasOpenAiPolicy = /^policy:\n  allow_implicit_invocation: false$/m.test(openai);

      assert.equal(hasClaudeFlag, expectedUserOnly, `${skillName} Claude invocation policy`);
      assert.equal(hasOpenAiPolicy, expectedUserOnly, `${skillName} OpenAI invocation policy`);
      assert.equal(hasClaudeFlag, hasOpenAiPolicy, `${skillName} invocation policies must match`);
    }),
  );
});
