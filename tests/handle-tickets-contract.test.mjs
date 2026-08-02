import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL(
  "../skills/engineering/handle-tickets/SKILL.md",
  import.meta.url,
);

test("handle-tickets keeps workflow comments append-only", async () => {
  const skill = await readFile(skillUrl, "utf8");

  assert.match(skill, /## PR Comment Policy/u);
  assert.match(skill, /Workflow-owned PR comments are append-only/u);
  assert.match(skill, /code-review cycle posts exactly one finalized comment/u);
  assert.doesNotMatch(
    skill,
    /post or update|update the same comment|update the existing|replace the prior current-state|keep updating that comment/iu,
  );
});

test("handle-tickets separates validity from merge relevance", async () => {
  const skill = await readFile(skillUrl, "utf8");

  assert.match(skill, /### Merge Relevance/u);
  assert.match(skill, /Required for this PR: yes \| no \| unknown/u);
  assert.match(skill, /Disposition: fix-now \| follow-up \| not-actionable/u);
  assert.match(skill, /smallest sufficient correction/u);
  assert.match(skill, /Prioritized follow-ups do not block completion/u);
});

test("handle-tickets uses references instead of duplicated authority", async () => {
  const skill = await readFile(skillUrl, "utf8");

  assert.match(skill, /## Reference Context/u);
  assert.match(skill, /point agents to authority rather than reproducing it/u);
  assert.match(skill, /fix worker receives the finalized review comment URL/u);
});
