import test from "node:test";
import assert from "node:assert/strict";

import {
  changeEvent,
  immediateEvent,
} from "../skills/engineering/codex-pr-review/scripts/watch-codex-pr.mjs";

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
