import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const skillDir = path.resolve("skills/engineering/handle-tickets");

test("handle-tickets is user-invoked in Claude and OpenAI", async () => {
  const [skill, openai] = await Promise.all([
    readFile(path.join(skillDir, "SKILL.md"), "utf8"),
    readFile(path.join(skillDir, "agents/openai.yaml"), "utf8"),
  ]);

  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.match(openai, /^policy:\n  allow_implicit_invocation: false$/m);
});
