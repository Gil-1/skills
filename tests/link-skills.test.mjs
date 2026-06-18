import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createNpxInvocation } from "../scripts/link-skills.mjs";

test("link skills script can spawn npx", () => {
  const invocation = createNpxInvocation(["--version"]);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
});
