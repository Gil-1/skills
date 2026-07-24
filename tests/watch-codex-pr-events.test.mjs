import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  changeEvent,
  completionVerificationRequired,
  immediateEvent,
  selectEvent,
} from "../skills/engineering/codex-pr-review/scripts/watch-codex-pr.mjs";

const watcherPath = new URL(
  "../skills/engineering/codex-pr-review/scripts/watch-codex-pr.mjs",
  import.meta.url,
);

function snapshot(overrides = {}) {
  return {
    headRefOid: "abc123",
    state: "OPEN",
    mergeStateStatus: "CLEAN",
    status: "none",
    freshFeedbackCount: 0,
    freshActiveCodexThreadCount: 0,
    currentHeadFeedbackCount: 0,
    dispositionedCurrentHeadFeedbackCount: 0,
    currentHeadActiveCodexThreadCount: 0,
    completionSnapshotTruncated: false,
    fingerprint: "initial",
    ...overrides,
  };
}

test("initial state and merge events precede Codex status", () => {
  assert.equal(
    immediateEvent(snapshot({ state: "CLOSED", status: "approved" }), "abc123"),
    "pr_state_changed",
  );
  assert.equal(
    immediateEvent(snapshot({ mergeStateStatus: "DIRTY", status: "approved" }), "abc123"),
    "merge_state_changed",
  );
});

test("changed PR and merge state precede changed Codex status", () => {
  const previous = snapshot();
  assert.equal(
    changeEvent(previous, snapshot({ state: "MERGED", status: "approved" })),
    "pr_state_changed",
  );
  assert.equal(
    changeEvent(previous, snapshot({ mergeStateStatus: "DIRTY", status: "approved" })),
    "merge_state_changed",
  );
});

test("head changes retain highest precedence", () => {
  assert.equal(
    immediateEvent(snapshot({ headRefOid: "def456", state: "CLOSED" }), "abc123"),
    "pr_head_changed",
  );
  assert.equal(
    changeEvent(snapshot(), snapshot({ headRefOid: "def456", state: "CLOSED" })),
    "pr_head_changed",
  );
});

test("composed selection keeps state changes ahead of Codex approval", () => {
  const previous = snapshot();
  assert.equal(
    selectEvent(previous, snapshot({ headRefOid: "def456", status: "approved" })),
    "pr_head_changed",
  );
  assert.equal(
    selectEvent(previous, snapshot({ mergeStateStatus: "BLOCKED", status: "approved" })),
    "merge_state_changed",
  );
});

test("cheap initial state changes precede first full-snapshot approval", () => {
  const cheapInitial = snapshot({ mergeStateStatus: "CLEAN" });
  const firstFull = snapshot({ mergeStateStatus: "BLOCKED", status: "approved" });
  assert.equal(selectEvent(cheapInitial, firstFull), "merge_state_changed");
});

test("symlinked CLI entrypoint still executes", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "watch-codex-pr-"));
  const symlinkPath = join(directory, "watch-codex-pr.mjs");
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  symlinkSync(watcherPath, symlinkPath);

  const output = execFileSync(process.execPath, [symlinkPath, "--help"], { encoding: "utf8" });
  assert.match(output, /^Usage: watch-codex-pr\.mjs/m);
});

test("terminal state skips truncated completion expansion", () => {
  const truncated = snapshot({
    state: "CLOSED",
    currentHeadFeedbackCount: 1,
    dispositionedCurrentHeadFeedbackCount: 1,
    completionSnapshotTruncated: true,
  });
  const precedingEvent = selectEvent(null, truncated);

  assert.equal(precedingEvent, "pr_state_changed");
  assert.equal(completionVerificationRequired(truncated, { fullHistory: false }, precedingEvent), false);
});
