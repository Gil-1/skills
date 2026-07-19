import assert from "node:assert/strict";
import test from "node:test";

import {
  immediateEvent,
  summarize,
} from "../skills/engineering/codex-pr-review/scripts/watch-codex-pr.mjs";

const headRefOid = "943dd4ee47223e7937efec7f8225c46901b5cf45";
const submittedAt = "2026-07-18T10:49:53Z";

function codexReviewFixture({
  disposition,
  resolved = true,
  bodyReactions = [],
  reviewHeadRefOid = headRefOid,
} = {}) {
  const reviewComment = {
    id: "review-comment-1",
    url: "https://example.test/review-comment-1",
    body: "[P2] Example finding",
    createdAt: submittedAt,
    updatedAt: submittedAt,
    path: "workflow.yml",
    line: 12,
    originalLine: 12,
    author: { login: "chatgpt-codex-connector" },
    reactions: {
      nodes: disposition ? [{ content: disposition, user: { login: "Gil-1" } }] : [],
      pageInfo: {},
    },
  };
  const review = {
    id: "review-1",
    url: "https://example.test/review-1",
    body: `Codex Review: automated review suggestions. Reviewed commit: \`${reviewHeadRefOid.slice(0, 10)}\``,
    state: "COMMENTED",
    submittedAt,
    commit: { oid: reviewHeadRefOid },
    author: { login: "chatgpt-codex-connector" },
    reactions: { nodes: [], pageInfo: {} },
    comments: { nodes: [reviewComment], pageInfo: {} },
  };

  return {
    number: 247,
    url: "https://example.test/pull/247",
    state: "OPEN",
    headRefName: "example-branch",
    headRefOid,
    baseRefName: "main",
    mergeStateStatus: "CLEAN",
    snapshotMode: "bounded",
    snapshotLimit: 50,
    snapshotTruncated: false,
    viewerLogin: "Gil-1",
    comments: { nodes: [] },
    timelineItems: { nodes: [] },
    reactions: { nodes: bodyReactions },
    reviews: { nodes: [review] },
    reviewThreads: {
      nodes: [{
        id: "thread-1",
        path: "workflow.yml",
        line: 12,
        isResolved: resolved,
        isOutdated: false,
        comments: { nodes: [reviewComment], pageInfo: {} },
      }],
    },
  };
}

test("completes an exact-head review when every finding is dispositioned and resolved", () => {
  const snapshot = summarize(codexReviewFixture({ disposition: "THUMBS_DOWN" }));

  assert.equal(snapshot.status, "none");
  assert.equal(snapshot.currentHeadFeedbackCount, 1);
  assert.equal(snapshot.dispositionedCurrentHeadFeedbackCount, 1);
  assert.equal(snapshot.activeCodexThreadCount, 0);
  assert.equal(immediateEvent(snapshot), "codex_review_complete");
});

test("keeps undispositioned feedback actionable", () => {
  const snapshot = summarize(codexReviewFixture());

  assert.equal(snapshot.freshFeedbackCount, 1);
  assert.equal(immediateEvent(snapshot), "codex_feedback_changed");
});

test("does not complete while a Codex review thread remains active", () => {
  const snapshot = summarize(codexReviewFixture({ disposition: "THUMBS_DOWN", resolved: false }));

  assert.equal(snapshot.activeCodexThreadCount, 1);
  assert.equal(immediateEvent(snapshot), undefined);
});

test("does not complete from a truncated feedback snapshot", () => {
  const fixture = codexReviewFixture({ disposition: "THUMBS_DOWN" });
  fixture.snapshotTruncated = true;
  const snapshot = summarize(fixture);

  assert.equal(immediateEvent(snapshot), undefined);
});

test("keeps explicit Codex approval as the preferred terminal event", () => {
  const snapshot = summarize(codexReviewFixture({
    disposition: "THUMBS_UP",
    bodyReactions: [{
      content: "THUMBS_UP",
      createdAt: "2026-07-18T10:50:00Z",
      user: { login: "chatgpt-codex-connector" },
    }],
  }));

  assert.equal(snapshot.status, "approved");
  assert.equal(immediateEvent(snapshot), "codex_approved");
});

test("accepts a clean PR-body thumbs-up without a current-head review object", () => {
  const snapshot = summarize(codexReviewFixture({
    reviewHeadRefOid: "17fe9f94dec4d9736f8d42b2a75d5e36d8ef7a55",
    bodyReactions: [{
      content: "THUMBS_UP",
      createdAt: "2026-07-19T13:26:53Z",
      user: { login: "chatgpt-codex-connector[bot]" },
    }],
  }));

  assert.equal(snapshot.currentHeadReview, null);
  assert.equal(snapshot.status, "approved");
  assert.equal(immediateEvent(snapshot), "codex_approved");
});
