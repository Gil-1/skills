#!/usr/bin/env node

import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BOT_LOGINS = new Set(["chatgpt-codex-connector", "chatgpt-codex-connector[bot]"]);
const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 1800;
const DEFAULT_MIN_GRAPHQL_REMAINING = 1000;
const MAX_BUFFER = 10 * 1024 * 1024;
const RATE_LIMIT_RESET_SAFETY_MS = 5000;

const STATUS_REACTION_CONTENTS = new Set(["EYES", "THUMBS_UP"]);

const QUERY = `
query WatchCodexPullRequest(
  $owner: String!,
  $name: String!,
  $number: Int!,
  $reactionCursor: String,
  $commentCursor: String,
  $reviewCursor: String,
  $threadCursor: String
) {
  viewer {
    login
  }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      headRefName
      headRefOid
      baseRefName
      mergeStateStatus
      commits(last: 1) {
        nodes {
          commit {
            oid
            pushedDate
            committedDate
          }
        }
      }
      timelineItems(last: 100, itemTypes: [PULL_REQUEST_COMMIT, ISSUE_COMMENT]) {
        nodes {
          __typename
          ... on PullRequestCommit {
            commit {
              oid
            }
          }
          ... on IssueComment {
            body
            createdAt
            author {
              login
            }
          }
        }
      }
      reactions(first: 100, after: $reactionCursor) {
        nodes {
          content
          createdAt
          user {
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      comments(first: 100, after: $commentCursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          id
          url
          body
          createdAt
          updatedAt
          author {
            login
          }
          reactions(first: 10) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      reviews(first: 100, after: $reviewCursor) {
        nodes {
          id
          url
          body
          state
          submittedAt
          commit {
            oid
          }
          author {
            login
          }
          reactions(first: 10) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
          comments(first: 100) {
            nodes {
              id
              url
              body
              path
              line
              originalLine
              createdAt
              updatedAt
              author {
                login
              }
              reactions(first: 10) {
                nodes {
                  content
                  user {
                    login
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      reviewThreads(first: 100, after: $threadCursor) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 100) {
            nodes {
              id
              url
              body
              createdAt
              updatedAt
              author {
                login
              }
              reactions(first: 10) {
                nodes {
                  content
                  user {
                    login
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

const REVIEW_COMMENTS_QUERY = `
query WatchCodexReviewComments($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on PullRequestReview {
      comments(first: 100, after: $cursor) {
        nodes {
          id
          url
          body
          path
          line
          originalLine
          createdAt
          updatedAt
          author {
            login
          }
          reactions(first: 10) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

const THREAD_COMMENTS_QUERY = `
query WatchCodexThreadComments($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $cursor) {
        nodes {
          id
          url
          body
          path
          line
          originalLine
          createdAt
          updatedAt
          author {
            login
          }
          reactions(first: 10) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

const COMMENT_REACTIONS_QUERY = `
query WatchCodexCommentReactions($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on IssueComment {
      reactions(first: 100, after: $cursor) {
        nodes {
          content
          user {
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    ... on PullRequestReviewComment {
      reactions(first: 100, after: $cursor) {
        nodes {
          content
          user {
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    ... on PullRequestReview {
      reactions(first: 100, after: $cursor) {
        nodes {
          content
          user {
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

function help() {
  return `Usage: watch-codex-pr.mjs [options]

Poll a GitHub PR until Codex PR status, Codex feedback, or merge state changes.
Requires the GitHub CLI to be installed and authenticated.

Options:
  --pr <number|url>       PR number, URL, or branch. Default: current branch PR.
  --repo <owner/name>     Repository. Default: current gh repo.
  --interval <seconds>    Poll interval. Default: ${DEFAULT_INTERVAL_SECONDS}.
  --timeout <seconds>     Maximum time to wait. Default: ${DEFAULT_TIMEOUT_SECONDS}.
  --min-graphql-remaining <points>
                          Wait for reset before polling when GraphQL budget is below this. Default: ${DEFAULT_MIN_GRAPHQL_REMAINING}.
  --once                  Print the current summarized state and exit.
  --help                  Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    pr: undefined,
    repo: undefined,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    minGraphqlRemaining: DEFAULT_MIN_GRAPHQL_REMAINING,
    once: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(help());
      process.exit(0);
    }
    if (arg === "--once") {
      options.once = true;
      continue;
    }
    if (["--pr", "--repo", "--interval", "--timeout", "--min-graphql-remaining"].includes(arg)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      i += 1;
      if (arg === "--pr") options.pr = value;
      if (arg === "--repo") options.repo = value;
      if (arg === "--interval") options.intervalSeconds = parsePositiveSeconds(arg, value);
      if (arg === "--timeout") options.timeoutSeconds = parsePositiveSeconds(arg, value);
      if (arg === "--min-graphql-remaining") options.minGraphqlRemaining = parseNonNegativeInteger(arg, value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parsePositiveSeconds(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseNonNegativeInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: MAX_BUFFER });
  return JSON.parse(stdout);
}

async function graphqlRateLimit() {
  try {
    return await ghJson(["api", "rate_limit", "--jq", ".resources.graphql"]);
  } catch {
    return null;
  }
}

function rateLimitWaitMs(rate) {
  const resetSeconds = Number(rate?.reset || 0);
  if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) return 0;
  return Math.max(0, resetSeconds * 1000 - Date.now() + RATE_LIMIT_RESET_SAFETY_MS);
}

async function waitForGraphqlBudget(options) {
  const minRemaining = Number(options.minGraphqlRemaining || 0);
  if (minRemaining <= 0) return;
  const rate = await graphqlRateLimit();
  const remaining = Number(rate?.remaining);
  if (!Number.isFinite(remaining) || remaining >= minRemaining) return;
  const waitMs = rateLimitWaitMs(rate);
  if (waitMs <= 0) return;
  const resetAt = rate?.reset ? new Date(Number(rate.reset) * 1000).toISOString() : "unknown";
  process.stderr.write(`watch-codex-pr: GitHub GraphQL remaining=${remaining} below ${minRemaining}; waiting until ${resetAt}\n`);
  await sleep(waitMs);
}

function isGraphqlRateLimitError(error) {
  const text = String(error?.stderr || error?.stdout || error?.message || error || "");
  return /API rate limit exceeded/i.test(text) || /graphql.*rate limit/i.test(text);
}

async function readSnapshotRateAware(target, options) {
  for (;;) {
    await waitForGraphqlBudget(options);
    try {
      return await readSnapshot(target);
    } catch (error) {
      if (!isGraphqlRateLimitError(error)) throw error;
      const rate = await graphqlRateLimit();
      const waitMs = rateLimitWaitMs(rate);
      if (waitMs <= 0) throw error;
      const resetAt = rate?.reset ? new Date(Number(rate.reset) * 1000).toISOString() : "unknown";
      process.stderr.write(`watch-codex-pr: GitHub GraphQL rate limit hit; waiting until ${resetAt}\n`);
      await sleep(waitMs);
    }
  }
}

async function resolveTarget(options) {
  const fromUrl = options.pr ? parsePrUrl(options.pr) : undefined;
  const repo = options.repo ?? fromUrl?.repo ?? (await currentRepo());
  const prViewArgs = ["pr", "view"];
  if (options.pr) prViewArgs.push(options.pr);
  prViewArgs.push("--repo", repo, "--json", "number,url");
  const pr = await ghJson(prViewArgs);
  return {
    repo,
    owner: repo.split("/")[0],
    name: repo.split("/").slice(1).join("/"),
    number: pr.number,
    url: pr.url,
  };
}

function parsePrUrl(value) {
  const match = value.match(/github\.com[/:]([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  if (!match) return undefined;
  return {
    repo: `${match[1]}/${match[2].replace(/\.git$/i, "")}`,
    number: Number.parseInt(match[3], 10),
  };
}

async function currentRepo() {
  const repo = await ghJson(["repo", "view", "--json", "nameWithOwner"]);
  if (!repo.nameWithOwner) throw new Error("Could not determine the current GitHub repository.");
  return repo.nameWithOwner;
}

async function readPullRequestPage(target, cursors = {}) {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${QUERY}`,
    "-F",
    `owner=${target.owner}`,
    "-F",
    `name=${target.name}`,
    "-F",
    `number=${target.number}`,
  ];
  for (const [name, cursor] of Object.entries(cursors)) {
    if (cursor) args.push("-F", `${name}=${cursor}`);
  }

  const response = await ghJson(args);
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) throw new Error(`Could not read PR #${target.number} in ${target.repo}.`);
  pr.viewerLogin = response?.data?.viewer?.login;
  return pr;
}

async function readSnapshot(target) {
  const pr = await readPullRequestPage(target);
  pr.reactions = await readConnectionPages(target, pr.reactions, "reactions", "reactionCursor");
  pr.comments = await readConnectionPages(target, pr.comments, "comments", "commentCursor");
  pr.reviews = await readConnectionPages(target, pr.reviews, "reviews", "reviewCursor");
  pr.reviewThreads = await readConnectionPages(target, pr.reviewThreads, "reviewThreads", "threadCursor");
  await readNestedCommentPages(pr.reviews?.nodes ?? [], REVIEW_COMMENTS_QUERY);
  await readNestedCommentPages(pr.reviewThreads?.nodes ?? [], THREAD_COMMENTS_QUERY);
  await readAllCommentReactionPages(pr);

  return summarize(pr);
}

async function readConnectionPages(target, initialConnection, connectionName, cursorName) {
  const nodes = [...(initialConnection?.nodes ?? [])];
  let pageInfo = initialConnection?.pageInfo;

  while (pageInfo?.hasNextPage) {
    const nextPr = await readPullRequestPage(target, { [cursorName]: pageInfo.endCursor });
    const nextConnection = nextPr[connectionName];
    nodes.push(...(nextConnection?.nodes ?? []));
    pageInfo = nextConnection?.pageInfo;
  }

  return {
    ...(initialConnection ?? {}),
    nodes,
    pageInfo,
  };
}

async function readNestedCommentPages(nodes, query) {
  for (const node of nodes) {
    node.comments = await readNodeConnectionPages(query, node.id, node.comments, "comments");
  }
}

async function readAllCommentReactionPages(pr) {
  await readCommentReactionPages(pr.comments?.nodes ?? []);
  await readCommentReactionPages(pr.reviews?.nodes ?? []);
  for (const review of pr.reviews?.nodes ?? []) {
    await readCommentReactionPages(review.comments?.nodes ?? []);
  }
  for (const thread of pr.reviewThreads?.nodes ?? []) {
    await readCommentReactionPages(thread.comments?.nodes ?? []);
  }
}

async function readCommentReactionPages(comments) {
  for (const comment of comments) {
    comment.reactions = await readNodeConnectionPages(COMMENT_REACTIONS_QUERY, comment.id, comment.reactions, "reactions");
  }
}

async function readNodeConnectionPages(query, nodeId, initialConnection, connectionName) {
  const nodes = [...(initialConnection?.nodes ?? [])];
  let pageInfo = initialConnection?.pageInfo;

  while (pageInfo?.hasNextPage) {
    const response = await ghJson([
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `id=${nodeId}`,
      "-F",
      `cursor=${pageInfo.endCursor}`,
    ]);
    const nextConnection = response?.data?.node?.[connectionName];
    nodes.push(...(nextConnection?.nodes ?? []));
    pageInfo = nextConnection?.pageInfo;
  }

  return {
    ...(initialConnection ?? {}),
    nodes,
    pageInfo,
  };
}

function summarize(pr) {
  const latestReviewRequestAt = latestCodexReviewRequestAt(pr.comments?.nodes ?? []);
  const currentHeadReview = latestCurrentHeadCodexReview(pr.reviews?.nodes ?? [], pr.headRefOid, latestReviewRequestAt);
  const headRefPushedAt = latestHeadCommitPushedAt(pr);
  const statusFreshAfter = latestReviewRequestAt;
  const bodyReactions = (pr.reactions?.nodes ?? [])
    .filter((reaction) => isCodexBotLogin(reaction.user?.login))
    .map((reaction) => ({
      content: normalizeReaction(reaction.content),
      createdAt: reaction.createdAt,
    }))
    .sort(compareByDateThenContent);

  const reviewCommentContextById = reviewCommentContext(pr.reviews?.nodes ?? []);
  const feedbackItems = collectFeedbackItems(pr);
  const activeCodexThreads = (pr.reviewThreads?.nodes ?? [])
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .filter((thread) => (thread.comments?.nodes ?? []).some((comment) => isCodexBotLogin(comment.author?.login)))
    .map((thread) => ({
      id: thread.id,
      path: thread.path,
      line: thread.line,
      comments: (thread.comments?.nodes ?? [])
        .filter((comment) => isCodexBotLogin(comment.author?.login))
        .map((comment) => ({
          ...summarizeItem("thread_comment", comment, pr.viewerLogin),
          ...reviewCommentContextById.get(comment.id),
          threadIsActive: true,
        })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const freshFeedbackItems = feedbackItems.filter((item) =>
    feedbackItemIsFresh(item, statusFreshAfter, pr.headRefOid, latestReviewRequestAt),
  );
  const freshActiveCodexThreads = activeCodexThreads.filter((thread) =>
    thread.comments.some((comment) => activeThreadCommentIsFresh(comment)),
  );
  const freshFeedbackAt = newestTimestamp(
    ...freshFeedbackItems.map(feedbackItemTimestamp),
    ...freshActiveCodexThreads.flatMap((thread) => thread.comments.map(feedbackItemTimestamp)),
  );
  const approvalFreshAfter = newestTimestamp(statusFreshAfter, currentHeadReview?.submittedAt, freshFeedbackAt);
  const approvalMatchesCurrentHead = Boolean(currentHeadReview)
    || reviewRequestCoversHead(pr, latestReviewRequestAt)
    || approvalReactionCoversHead(bodyReactions, headRefPushedAt);
  const status = codexStatusFromReactions(bodyReactions, approvalFreshAfter, approvalMatchesCurrentHead);

  return {
    number: pr.number,
    url: pr.url,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    baseRefName: pr.baseRefName,
    mergeStateStatus: pr.mergeStateStatus,
    headRefPushedAt,
    latestReviewRequestAt,
    currentHeadReview,
    statusFreshAfter,
    freshFeedbackAt,
    approvalFreshAfter,
    approvalMatchesCurrentHead,
    status,
    bodyReactions,
    feedbackItems,
    activeCodexThreads,
    feedbackCount: feedbackItems.length,
    activeCodexThreadCount: activeCodexThreads.length,
    freshFeedbackCount: freshFeedbackItems.length,
    freshActiveCodexThreadCount: freshActiveCodexThreads.length,
    fingerprint: fingerprint({
      headRefOid: pr.headRefOid,
      headRefPushedAt,
      statusFreshAfter,
      approvalFreshAfter,
      approvalMatchesCurrentHead,
      status,
      bodyReactions,
      feedbackItems,
      activeCodexThreads,
      mergeStateStatus: pr.mergeStateStatus,
    }),
  };
}

function normalizeReaction(content) {
  return content === "+1" ? "THUMBS_UP" : content;
}

function compareByDateThenContent(a, b) {
  return String(a.createdAt).localeCompare(String(b.createdAt)) || a.content.localeCompare(b.content);
}

function codexStatusFromReactions(bodyReactions, statusFreshAfter, approvalMatchesCurrentHead) {
  const newestStatusReaction = bodyReactions
    .filter((reaction) => STATUS_REACTION_CONTENTS.has(reaction.content))
    .filter((reaction) => isFreshTimestamp(reaction.createdAt, statusFreshAfter))
    .at(-1);

  if (newestStatusReaction?.content === "THUMBS_UP" && approvalMatchesCurrentHead) return "approved";
  if (newestStatusReaction?.content === "EYES") return "reviewing";
  if (bodyReactions.some((reaction) => isFreshTimestamp(reaction.createdAt, statusFreshAfter))) {
    return "other-reaction";
  }
  return "none";
}

function latestHeadCommitPushedAt(pr) {
  const commit = (pr.commits?.nodes ?? []).at(-1)?.commit;
  return commit?.pushedDate ?? commit?.committedDate ?? null;
}

function approvalReactionCoversHead(bodyReactions, headRefPushedAt) {
  if (!headRefPushedAt) return false;
  const newestApproval = bodyReactions
    .filter((reaction) => reaction.content === "THUMBS_UP")
    .at(-1);
  return Boolean(newestApproval && isFreshTimestamp(newestApproval.createdAt, headRefPushedAt));
}

function reviewRequestCoversHead(pr, latestReviewRequestAt) {
  if (!latestReviewRequestAt) return false;
  return reviewRequestFollowsHeadCommit(pr, latestReviewRequestAt);
}

function reviewRequestFollowsHeadCommit(pr, latestReviewRequestAt) {
  const latestReviewRequestTime = Date.parse(latestReviewRequestAt);
  if (Number.isNaN(latestReviewRequestTime)) return false;
  let currentHeadIndex = -1;
  let latestReviewRequestIndex = -1;
  for (const [index, item] of (pr.timelineItems?.nodes ?? []).entries()) {
    if (item.__typename === "PullRequestCommit" && commitMatchesHead(item.commit?.oid, pr.headRefOid)) {
      currentHeadIndex = index;
    }
    if (
      item.__typename === "IssueComment"
      && isCodexReviewRequest(item)
      && Date.parse(item.createdAt ?? "") === latestReviewRequestTime
    ) {
      latestReviewRequestIndex = index;
    }
  }
  return currentHeadIndex >= 0 && latestReviewRequestIndex > currentHeadIndex;
}

function latestCodexReviewRequestAt(comments) {
  return newestTimestamp(
    ...comments
      .filter(isCodexReviewRequest)
      .map((comment) => comment.createdAt),
  );
}

function isCodexReviewRequest(comment) {
  return /^\s*@codex\s+review\s*$/i.test(comment.body ?? "");
}

function latestCurrentHeadCodexReview(reviews, headRefOid, latestReviewRequestAt) {
  const matchingReviews = reviews
    .filter((review) => isCodexBotLogin(review.author?.login))
    .map((review) => ({
      id: review.id,
      url: review.url,
      submittedAt: review.submittedAt,
      reviewedCommitOid: reviewedCommitOid(review),
    }))
    .filter((review) => commitMatchesHead(review.reviewedCommitOid, headRefOid))
    .filter((review) => isFreshTimestamp(review.submittedAt, latestReviewRequestAt))
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));

  return matchingReviews.at(-1) ?? null;
}

function newestTimestamp(...timestamps) {
  const sorted = timestamps
    .filter(Boolean)
    .map((timestamp) => new Date(timestamp))
    .filter((date) => !Number.isNaN(date.valueOf()))
    .sort((a, b) => a.valueOf() - b.valueOf());
  return sorted.at(-1)?.toISOString();
}

function isFreshTimestamp(timestamp, statusFreshAfter) {
  if (!statusFreshAfter) return true;
  const value = Date.parse(timestamp ?? "");
  const boundary = Date.parse(statusFreshAfter);
  return !Number.isNaN(value) && !Number.isNaN(boundary) && value >= boundary;
}

function feedbackItemIsFresh(item, statusFreshAfter, headRefOid, latestReviewRequestAt) {
  if (item.validityReaction) return false;
  if (item.reviewedCommitOid && headRefOid) {
    return commitMatchesHead(item.reviewedCommitOid, headRefOid)
      && isFreshTimestamp(item.updatedAt ?? item.createdAt, latestReviewRequestAt);
  }
  return isFreshTimestamp(item.updatedAt ?? item.createdAt, statusFreshAfter);
}

function activeThreadCommentIsFresh(item) {
  // GitHub keeps unresolved, non-outdated threads active across unrelated head changes.
  return !item.validityReaction;
}

function feedbackItemTimestamp(item) {
  return item.updatedAt ?? item.createdAt;
}

function commitMatchesHead(commitOid, headRefOid) {
  return Boolean(commitOid && headRefOid && (headRefOid.startsWith(commitOid) || commitOid.startsWith(headRefOid)));
}

function collectFeedbackItems(pr) {
  const items = [];

  for (const comment of pr.comments?.nodes ?? []) {
    if (isCodexBotLogin(comment.author?.login) && commentHasActionableBody(comment)) {
      items.push(summarizeItem("pr_comment", comment, pr.viewerLogin));
    }
  }

  for (const review of pr.reviews?.nodes ?? []) {
    if (isCodexBotLogin(review.author?.login) && reviewHasActionableBody(review)) {
      items.push({
        ...summarizeItem(
          "review",
          { ...review, createdAt: review.submittedAt, updatedAt: review.submittedAt },
          pr.viewerLogin,
        ),
        state: review.state,
        reviewedCommitOid: reviewedCommitOid(review),
      });
    }
    for (const comment of review.comments?.nodes ?? []) {
      if (isCodexBotLogin(comment.author?.login)) {
        items.push({
          ...summarizeItem("review_comment", comment, pr.viewerLogin),
          path: comment.path,
          line: comment.line,
          originalLine: comment.originalLine,
          reviewedCommitOid: reviewedCommitOid(review),
        });
      }
    }
  }

  return items.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function reviewHasActionableBody(review) {
  const body = review.body?.trim() ?? "";
  if (!body) return false;
  return !(/Codex Review/i.test(body) && /automated review suggestions/i.test(body) && /Reviewed commit:/i.test(body));
}

function commentHasActionableBody(comment) {
  const body = comment.body?.trim() ?? "";
  if (!body) return false;
  return !(/Codex Review:\s*Didn't find any major issues/i.test(body) && /Reviewed commit:/i.test(body));
}

function isCodexBotLogin(login) {
  return BOT_LOGINS.has(login);
}

function reviewCommentContext(reviews) {
  const context = new Map();
  for (const review of reviews) {
    const reviewedCommit = reviewedCommitOid(review);
    for (const comment of review.comments?.nodes ?? []) {
      context.set(comment.id, { reviewedCommitOid: reviewedCommit });
    }
  }
  return context;
}

function reviewedCommitOid(review) {
  return review.commit?.oid ?? parseReviewedCommitOid(review.body);
}

function parseReviewedCommitOid(body) {
  return body?.match(/Reviewed commit:\*\*\s*`([0-9a-f]{7,40})`/i)?.[1]
    ?? body?.match(/Reviewed commit:\s*`([0-9a-f]{7,40})`/i)?.[1]
    ?? null;
}

function summarizeItem(kind, item, handlerLogin) {
  return {
    kind,
    id: item.id,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    hasBody: Boolean(item.body?.trim()),
    validityReaction: validityReaction(item.reactions?.nodes ?? [], handlerLogin),
  };
}

function validityReaction(reactions, handlerLogin) {
  if (!handlerLogin) return null;
  return reactions
    .map((reaction) => ({
      content: normalizeReaction(reaction.content),
      user: reaction.user?.login,
    }))
    .find((reaction) =>
      ["THUMBS_UP", "THUMBS_DOWN"].includes(reaction.content) && reaction.user === handlerLogin,
    ) ?? null;
}

function fingerprint(summary) {
  return JSON.stringify({
    headRefOid: summary.headRefOid,
    headRefPushedAt: summary.headRefPushedAt,
    statusFreshAfter: summary.statusFreshAfter,
    approvalFreshAfter: summary.approvalFreshAfter,
    approvalMatchesCurrentHead: summary.approvalMatchesCurrentHead,
    status: summary.status,
    bodyReactions: summary.bodyReactions.map((reaction) => `${reaction.content}:${reaction.createdAt}`),
    mergeStateStatus: summary.mergeStateStatus,
    feedbackItems: summary.feedbackItems.map((item) => [
      item.kind,
      item.id,
      item.state,
      item.updatedAt,
      item.hasBody,
      item.validityReaction?.content,
      item.path,
      item.line,
    ]),
    activeCodexThreads: summary.activeCodexThreads.map((thread) => [
      thread.id,
      thread.path,
      thread.line,
      thread.comments.map((comment) => [comment.id, comment.updatedAt, comment.hasBody]),
    ]),
  });
}

function immediateEvent(snapshot) {
  if (snapshot.status === "approved") return "codex_approved";
  if (snapshot.freshFeedbackCount > 0 || snapshot.freshActiveCodexThreadCount > 0) return "codex_feedback_changed";
  return undefined;
}

function changeEvent(previous, current) {
  if (previous.status !== current.status) return "codex_status_changed";
  if (previous.mergeStateStatus !== current.mergeStateStatus) return "merge_state_changed";
  if (previous.fingerprint !== current.fingerprint) return "codex_feedback_changed";
  return undefined;
}

function slim(snapshot) {
  const { fingerprint: _fingerprint, ...rest } = snapshot;
  return rest;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function watch(options) {
  const target = await resolveTarget(options);
  const startedAt = Date.now();
  const intervalMs = options.intervalSeconds * 1000;
  const timeoutMs = options.timeoutSeconds * 1000;
  const initial = await readSnapshotRateAware(target, options);

  if (options.once) {
    printResult({ event: "snapshot", target, current: slim(initial) });
    return;
  }

  const initialEvent = immediateEvent(initial);
  if (initialEvent) {
    printResult({
      event: initialEvent,
      target,
      elapsedSeconds: 0,
      polls: 1,
      previous: null,
      current: slim(initial),
    });
    return;
  }

  let polls = 1;
  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    await sleep(Math.min(intervalMs, Math.max(0, remainingMs)));
    polls += 1;

    const current = await readSnapshotRateAware(target, options);
    const event = immediateEvent(current) ?? changeEvent(initial, current);
    if (event) {
      printResult({
        event,
        target,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        polls,
        previous: slim(initial),
        current: slim(current),
      });
      return;
    }
  }

  const current = await readSnapshotRateAware(target, options);
  printResult({
    event: "timeout",
    target,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    polls,
    previous: slim(initial),
    current: slim(current),
  });
}

watch(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
