import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL(
  "../skills/engineering/handle-tickets/SKILL.md",
  import.meta.url,
);

function section(skill, start, end) {
  const startIndex = skill.indexOf(start);
  const endIndex = skill.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section boundary: ${end}`);
  return skill.slice(startIndex, endIndex);
}

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
  const implement = section(skill, "### 2. Implement", "### 3. Code Review");
  const codeReview = section(skill, "### 3. Code Review", "### Review Finding Validation");
  const localCodex = section(skill, "### 5. Local Codex Review/Fix", "### 6. Ready PR and Run Codex PR Review");
  const scopeFit = section(skill, "### 7. Check Final Scope Fit", "### Ticket Conductor Handoff");

  assert.match(skill, /## Reference Context/u);
  assert.match(skill, /point agents to authority rather than reproducing it/u);
  assert.match(skill, /fix worker receives the finalized review comment URL/u);
  assert.match(implement, /Spawn a worker with `implement` and the references required/u);
  assert.match(codeReview, /Spawn a fresh worker with `code-review` and the references required/u);
  assert.match(localCodex, /Spawn a fresh `codex-local-review` worker with the references required/u);
  assert.match(scopeFit, /spawn a fresh worker with the references required by \*\*Reference Context\*\*/u);
  assert.doesNotMatch(
    skill,
    /linked PRD context when present|linked PRD or spec context when present|linked PRD or spec, fixed point, and full PR diff/u,
  );
});

test("handle-tickets applies merge relevance to hosted findings", async () => {
  const skill = await readFile(skillUrl, "utf8");
  const hostedReview = section(
    skill,
    "### 6. Ready PR and Run Codex PR Review",
    "### 7. Check Final Scope Fit",
  );

  assert.match(
    hostedReview,
    /return every hosted candidate to the conductor before authorizing a fixer/u,
  );
  assert.match(hostedReview, /resumes the same PR worker with only finalized `fix-now` findings authorized/u);
});
