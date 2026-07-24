#!/usr/bin/env node

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BOT_LOGINS = new Set(["chatgpt-codex-connector", "chatgpt-codex-connector[bot]"]);
const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 1800;
const DEFAULT_MIN_GRAPHQL_REMAINING = 100;
const DEFAULT_FEEDBACK_LIMIT = 50;
const MAX_FEEDBACK_LIMIT = 100;
const MAX_BUFFER = 10 * 1024 * 1024;
const RATE_LIMIT_RESET_SAFETY_MS = 5000;
const SECONDARY_RATE_LIMIT_BACKOFF_MS = 60 * 1000;
const MAX_SECONDARY_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

const STATUS_REACTION_CONTENTS = new Set(["EYES", "THUMBS_UP"]);

class WatcherTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "WatcherTimeoutError";
  }
}

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
      state
      headRefName
      headRefOid
      baseRefName
      mergeStateStatus
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

const WINDOW_QUERY = `
query WatchCodexPullRequestWindow(
  $owner: String!,
  $name: String!,
  $number: Int!,
  $feedbackLimit: Int!
) {
  viewer {
    login
  }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      state
      headRefName
      headRefOid
      baseRefName
      mergeStateStatus
      timelineItems(last: $feedbackLimit, itemTypes: [PULL_REQUEST_COMMIT, ISSUE_COMMENT]) {
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
        pageInfo {
          hasPreviousPage
        }
      }
      reactions(last: 100) {
        nodes {
          content
          createdAt
          user {
            login
          }
        }
        pageInfo {
          hasPreviousPage
        }
      }
      comments(first: $feedbackLimit, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          id
          url
          body
          createdAt
          updatedAt
          author {
            login
          }
          reactions(first: 20) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
      reviews(last: $feedbackLimit) {
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
          reactions(first: 20) {
            nodes {
              content
              user {
                login
              }
            }
            pageInfo {
              hasNextPage
            }
          }
          comments(last: $feedbackLimit) {
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
              reactions(first: 20) {
                nodes {
                  content
                  user {
                    login
                  }
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
            pageInfo {
              hasPreviousPage
            }
          }
        }
        pageInfo {
          hasPreviousPage
        }
      }
      reviewThreads(last: $feedbackLimit) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(last: $feedbackLimit) {
            nodes {
              id
              url
              body
              createdAt
              updatedAt
              author {
                login
              }
              reactions(first: 20) {
                nodes {
                  content
                  user {
                    login
                  }
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
            pageInfo {
              hasPreviousPage
            }
          }
        }
        pageInfo {
          hasPreviousPage
        }
      }
    }
  }
}
`;

const CHEAP_STATUS_QUERY = `
query WatchCodexPullRequestCheapStatus($owner: String!, $name: String!, $number: Int!) {
  rateLimit {
    cost
    limit
    used
    remaining
    resetAt
  }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      state
      headRefName
      headRefOid
      baseRefName
      mergeStateStatus
      updatedAt
      reactions(last: 20) {
        nodes {
          content
          createdAt
          user {
            login
          }
        }
        pageInfo {
          hasPreviousPage
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

Poll a GitHub PR until Codex PR status, Codex feedback, PR state, or mergeability status changes.
Requires the GitHub CLI to be installed and authenticated.

Options:
  --pr <number|url>       PR number, URL, or branch. Default: current branch PR.
  --repo <owner/name>     Repository. Default: current gh repo.
  --interval <seconds>    Poll interval. Default: ${DEFAULT_INTERVAL_SECONDS}.
  --timeout <seconds>     Maximum time to wait. Default: ${DEFAULT_TIMEOUT_SECONDS}.
  --min-graphql-remaining <points>
                          Wait for primary reset before polling when GraphQL budget is below this. Default: ${DEFAULT_MIN_GRAPHQL_REMAINING}.
  --feedback-limit <items>
                          Number of recent comments/reviews/threads to inspect in bounded snapshots. Default: ${DEFAULT_FEEDBACK_LIMIT}, max: ${MAX_FEEDBACK_LIMIT}.
  --expected-head <sha>   Expected full PR head SHA. Emits pr_head_changed if the PR is on another head.
  --status-fresh-after <timestamp>
                          Ignore PR-body status reactions older than this ISO-8601 review-cycle boundary.
  --full-history          Page through all PR comments/reviews/threads/reactions. Expensive; use only for manual diagnostics.
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
    feedbackLimit: DEFAULT_FEEDBACK_LIMIT,
    expectedHead: undefined,
    statusFreshAfter: undefined,
    fullHistory: false,
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
    if (arg === "--full-history") {
      options.fullHistory = true;
      continue;
    }
    if (["--pr", "--repo", "--interval", "--timeout", "--min-graphql-remaining", "--feedback-limit", "--expected-head", "--status-fresh-after"].includes(arg)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      i += 1;
      if (arg === "--pr") options.pr = value;
      if (arg === "--repo") options.repo = value;
      if (arg === "--interval") options.intervalSeconds = parsePositiveSeconds(arg, value);
      if (arg === "--timeout") options.timeoutSeconds = parsePositiveSeconds(arg, value);
      if (arg === "--min-graphql-remaining") options.minGraphqlRemaining = parseNonNegativeInteger(arg, value);
      if (arg === "--feedback-limit") options.feedbackLimit = parseFeedbackLimit(arg, value);
      if (arg === "--expected-head") options.expectedHead = parseHeadOid(arg, value);
      if (arg === "--status-fresh-after") options.statusFreshAfter = parseTimestamp(arg, value);
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

function parseFeedbackLimit(name, value) {
  const parsed = parsePositiveSeconds(name, value);
  if (parsed > MAX_FEEDBACK_LIMIT) throw new Error(`${name} must be ${MAX_FEEDBACK_LIMIT} or less`);
  return parsed;
}

function parseHeadOid(name, value) {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${name} must be a full 40-character commit SHA`);
  return value.toLowerCase();
}

function parseTimestamp(name, value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${name} must be a valid ISO-8601 timestamp`);
  return parsed.toISOString();
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

function deadlineRemainingMs(options) {
  const deadlineMs = Number(options.deadlineMs);
  if (!Number.isFinite(deadlineMs)) return undefined;
  return Math.max(0, deadlineMs - Date.now());
}

function cappedWaitMs(waitMs, options) {
  const remainingMs = deadlineRemainingMs(options);
  if (remainingMs === undefined) return waitMs;
  return Math.min(waitMs, remainingMs);
}

async function sleepWithinDeadline(waitMs, options, reason) {
  const cappedMs = cappedWaitMs(waitMs, options);
  if (cappedMs > 0) await sleep(cappedMs);
  if (cappedMs < waitMs) throw new WatcherTimeoutError(`${reason} exceeded watcher timeout`);
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
  const waitSeconds = Math.ceil(cappedWaitMs(waitMs, options) / 1000);
  process.stderr.write(`watch-codex-pr: GitHub GraphQL remaining=${remaining} below ${minRemaining}; waiting up to ${waitSeconds}s for reset at ${resetAt}\n`);
  await sleepWithinDeadline(waitMs, options, "GitHub GraphQL budget wait");
}

function errorText(error) {
  return [error?.stderr, error?.stdout, error?.message, error]
    .filter(Boolean)
    .map(String)
    .join("\n");
}

function isGraphqlRateLimitError(error) {
  const text = errorText(error);
  return /API rate limit exceeded/i.test(text)
    || /graphql.*rate limit/i.test(text)
    || isGraphqlSecondaryRateLimitError(error);
}

function isGraphqlSecondaryRateLimitError(error) {
  return /secondary rate limit|abuse detection|too many requests/i.test(errorText(error));
}

function retryAfterMs(error) {
  const match = errorText(error).match(/retry-after:\s*(\d+)/i);
  if (!match) return undefined;
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isInteger(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}

async function waitAfterGraphqlRateLimit(error, options, secondaryBackoffMs) {
  if (!isGraphqlRateLimitError(error)) throw error;
  if (isGraphqlSecondaryRateLimitError(error)) {
    const waitMs = retryAfterMs(error) ?? secondaryBackoffMs;
    const waitSeconds = Math.ceil(cappedWaitMs(waitMs, options) / 1000);
    process.stderr.write(`watch-codex-pr: GitHub GraphQL secondary rate limit hit; waiting up to ${waitSeconds}s before retry\n`);
    await sleepWithinDeadline(waitMs, options, "GitHub GraphQL secondary rate limit wait");
    return Math.min(secondaryBackoffMs * 2, MAX_SECONDARY_RATE_LIMIT_BACKOFF_MS);
  }
  const rate = await graphqlRateLimit();
  const waitMs = rateLimitWaitMs(rate);
  if (waitMs <= 0) throw error;
  const resetAt = rate?.reset ? new Date(Number(rate.reset) * 1000).toISOString() : "unknown";
  const waitSeconds = Math.ceil(cappedWaitMs(waitMs, options) / 1000);
  process.stderr.write(`watch-codex-pr: GitHub GraphQL rate limit hit; waiting up to ${waitSeconds}s for reset at ${resetAt}\n`);
  await sleepWithinDeadline(waitMs, options, "GitHub GraphQL rate limit wait");
  return secondaryBackoffMs;
}

async function ghJsonRateAware(args, options) {
  let secondaryBackoffMs = SECONDARY_RATE_LIMIT_BACKOFF_MS;
  for (;;) {
    await waitForGraphqlBudget(options);
    try {
      return await ghJson(args);
    } catch (error) {
      secondaryBackoffMs = await waitAfterGraphqlRateLimit(error, options, secondaryBackoffMs);
    }
  }
}

async function readSnapshotRateAware(target, options) {
  let secondaryBackoffMs = SECONDARY_RATE_LIMIT_BACKOFF_MS;
  for (;;) {
    await waitForGraphqlBudget(options);
    try {
      return await readSnapshot(target, options);
    } catch (error) {
      secondaryBackoffMs = await waitAfterGraphqlRateLimit(error, options, secondaryBackoffMs);
    }
  }
}

async function readCheapStatusRateAware(target, options) {
  let secondaryBackoffMs = SECONDARY_RATE_LIMIT_BACKOFF_MS;
  for (;;) {
    await waitForGraphqlBudget(options);
    try {
      return await readCheapStatus(target);
    } catch (error) {
      secondaryBackoffMs = await waitAfterGraphqlRateLimit(error, options, secondaryBackoffMs);
    }
  }
}

async function resolveTarget(options) {
  const fromUrl = options.pr ? parsePrUrl(options.pr) : undefined;
  const repo = options.repo ?? fromUrl?.repo ?? (await currentRepo(options));
  const number = fromUrl?.number ?? parsePrNumber(options.pr);
  if (number) return targetFromNumber(repo, number);

  const prViewArgs = ["pr", "view"];
  if (options.pr) prViewArgs.push(options.pr);
  prViewArgs.push("--repo", repo, "--json", "number,url");
  const pr = await ghJsonRateAware(prViewArgs, options);
  return targetFromNumber(repo, pr.number, pr.url);
}

function targetFromNumber(repo, number, url = `https://github.com/${repo}/pull/${number}`) {
  return {
    repo,
    owner: repo.split("/")[0],
    name: repo.split("/").slice(1).join("/"),
    number,
    url,
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

function parsePrNumber(value) {
  if (!value || !/^\d+$/.test(String(value))) return undefined;
  return Number.parseInt(value, 10);
}

async function currentRepo(options) {
  const repo = await ghJsonRateAware(["repo", "view", "--json", "nameWithOwner"], options);
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

async function readPullRequestWindow(target, feedbackLimit) {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${WINDOW_QUERY}`,
    "-F",
    `owner=${target.owner}`,
    "-F",
    `name=${target.name}`,
    "-F",
    `number=${target.number}`,
    "-F",
    `feedbackLimit=${feedbackLimit}`,
  ];

  const response = await ghJson(args);
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) throw new Error(`Could not read PR #${target.number} in ${target.repo}.`);
  pr.viewerLogin = response?.data?.viewer?.login;
  pr.snapshotMode = "bounded";
  pr.snapshotLimit = feedbackLimit;
  pr.snapshotTruncated = snapshotHasMore(pr);
  pr.completionSnapshotTruncated = completionSnapshotHasMore(pr);
  return pr;
}

async function readCheapStatus(target) {
  const response = await ghJson([
    "api",
    "graphql",
    "-f",
    `query=${CHEAP_STATUS_QUERY}`,
    "-F",
    `owner=${target.owner}`,
    "-F",
    `name=${target.name}`,
    "-F",
    `number=${target.number}`,
  ]);
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) throw new Error(`Could not read PR #${target.number} in ${target.repo}.`);
  return summarizeCheapStatus(pr, response?.data?.rateLimit);
}

async function readSnapshot(target, options) {
  if (!options.fullHistory) {
    return summarize(await readPullRequestWindow(target, options.feedbackLimit), options);
  }

  const pr = await readPullRequestPage(target);
  pr.reactions = await readConnectionPages(target, pr.reactions, "reactions", "reactionCursor");
  pr.comments = await readConnectionPages(target, pr.comments, "comments", "commentCursor");
  pr.reviews = await readConnectionPages(target, pr.reviews, "reviews", "reviewCursor");
  pr.reviewThreads = await readConnectionPages(target, pr.reviewThreads, "reviewThreads", "threadCursor");
  await readNestedCommentPages(pr.reviews?.nodes ?? [], REVIEW_COMMENTS_QUERY);
  await readNestedCommentPages(pr.reviewThreads?.nodes ?? [], THREAD_COMMENTS_QUERY);
  await readAllCommentReactionPages(pr);
  pr.snapshotMode = "full-history";
  pr.snapshotLimit = null;
  pr.snapshotTruncated = false;
  pr.completionSnapshotTruncated = false;

  return summarize(pr, options);
}

function snapshotHasMore(pr) {
  return connectionHasMore(pr.timelineItems) || completionSnapshotHasMore(pr);
}

function completionSnapshotHasMore(pr) {
  return Boolean(
    connectionHasMore(pr.reactions)
    || connectionHasMore(pr.comments)
    || connectionHasMore(pr.reviews)
    || connectionHasMore(pr.reviewThreads)
    || (pr.comments?.nodes ?? []).some(commentHasMoreReactions)
    || (pr.reviews?.nodes ?? []).some(reviewHasMoreCheapFeedback)
    || (pr.reviewThreads?.nodes ?? []).some(threadHasMoreCheapFeedback)
  );
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

function summarize(pr, options = {}) {
  const latestReviewRequestAt = latestCodexReviewRequestAt([
    ...(pr.comments?.nodes ?? []),
    ...issueCommentsFromTimeline(pr.timelineItems?.nodes ?? []),
  ]);
  const statusFreshAfter = newestTimestamp(latestReviewRequestAt, options.statusFreshAfter);
  const currentHeadReview = latestCurrentHeadCodexReview(pr.reviews?.nodes ?? [], pr.headRefOid, statusFreshAfter);
  // Commit pushedDate is not PR head movement time, so do not use it for approval freshness.
  const headRefPushedAt = null;
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
    .map((thread) => {
      const comments = (thread.comments?.nodes ?? [])
        .filter((comment) => isCodexBotLogin(comment.author?.login))
        .map((comment) => ({
          ...summarizeItem("thread_comment", comment, pr.viewerLogin),
          ...reviewCommentContextById.get(comment.id),
          threadIsActive: true,
        }));
      return {
        id: thread.id,
        path: thread.path,
        line: thread.line,
        priority: highestCodexPriority(comments.map((comment) => comment.priority)),
        comments,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const freshFeedbackItems = feedbackItems.filter((item) =>
    feedbackItemIsFresh(item, statusFreshAfter, pr.headRefOid, latestReviewRequestAt),
  );
  const currentHeadFeedbackItems = feedbackItems.filter((item) =>
    feedbackItemCoversCurrentHead(item, pr.headRefOid, latestReviewRequestAt),
  );
  const dispositionedCurrentHeadFeedbackItems = currentHeadFeedbackItems.filter((item) => item.validityReaction);
  const freshFeedbackItemIds = new Set(freshFeedbackItems.map((item) => item.id));
  const freshActiveCodexThreads = activeCodexThreads
    .map((thread) => {
      const comments = thread.comments.filter((comment) =>
        !freshFeedbackItemIds.has(comment.id)
        && feedbackItemIsFresh(comment, statusFreshAfter, pr.headRefOid, latestReviewRequestAt),
      );
      return {
        ...thread,
        priority: highestCodexPriority(comments.map((comment) => comment.priority)),
        comments,
      };
    })
    .filter((thread) => thread.comments.length > 0);
  const currentHeadActiveCodexThreads = activeCodexThreads.filter((thread) =>
    thread.comments.some((comment) =>
      feedbackItemCoversCurrentHead(comment, pr.headRefOid, latestReviewRequestAt),
    ),
  );
  const freshFeedbackAt = newestTimestamp(
    ...freshFeedbackItems.map(feedbackItemTimestamp),
    ...freshActiveCodexThreads.flatMap((thread) => thread.comments.map(feedbackItemTimestamp)),
  );
  const status = codexStatusFromReactions(bodyReactions, statusFreshAfter);

  return {
    number: pr.number,
    url: pr.url,
    state: pr.state,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    baseRefName: pr.baseRefName,
    mergeStateStatus: pr.mergeStateStatus,
    snapshotMode: pr.snapshotMode,
    snapshotLimit: pr.snapshotLimit,
    snapshotTruncated: Boolean(pr.snapshotTruncated),
    completionSnapshotTruncated: Boolean(pr.completionSnapshotTruncated),
    headRefPushedAt,
    expectedHeadRefOid: options.expectedHead ?? null,
    latestReviewRequestAt,
    currentHeadReview,
    statusFreshAfter,
    freshFeedbackAt,
    status,
    bodyReactions,
    feedbackItems,
    activeCodexThreads,
    freshFeedbackItems,
    freshActiveCodexThreads,
    feedbackCount: feedbackItems.length,
    currentHeadFeedbackCount: currentHeadFeedbackItems.length,
    dispositionedCurrentHeadFeedbackCount: dispositionedCurrentHeadFeedbackItems.length,
    activeCodexThreadCount: activeCodexThreads.length,
    currentHeadActiveCodexThreadCount: currentHeadActiveCodexThreads.length,
    freshFeedbackCount: freshFeedbackItems.length,
    freshActiveCodexThreadCount: freshActiveCodexThreads.length,
    fingerprint: fingerprint({
      headRefOid: pr.headRefOid,
      headRefPushedAt,
      statusFreshAfter,
      status,
      state: pr.state,
      bodyReactions,
      feedbackItems,
      activeCodexThreads,
      mergeStateStatus: pr.mergeStateStatus,
    }),
  };
}

function summarizeCheapStatus(pr, rateLimit) {
  return {
    number: pr.number,
    url: pr.url,
    state: pr.state,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    baseRefName: pr.baseRefName,
    mergeStateStatus: pr.mergeStateStatus,
    updatedAt: pr.updatedAt,
    rateLimit,
    statusReactionWindowTruncated: Boolean(pr.reactions?.pageInfo?.hasPreviousPage),
    fingerprint: cheapFingerprint(pr),
  };
}

function cheapStatusChanged(previous, current) {
  return !previous || previous.fingerprint !== current.fingerprint;
}

function connectionHasMore(connection) {
  return Boolean(connection?.pageInfo?.hasNextPage || connection?.pageInfo?.hasPreviousPage);
}

function commentHasMoreReactions(comment) {
  return connectionHasMore(comment.reactions);
}

function reviewHasMoreCheapFeedback(review) {
  return connectionHasMore(review.reactions)
    || connectionHasMore(review.comments)
    || (review.comments?.nodes ?? []).some(commentHasMoreReactions);
}

function threadHasMoreCheapFeedback(thread) {
  return connectionHasMore(thread.comments)
    || (thread.comments?.nodes ?? []).some(commentHasMoreReactions);
}

function cheapFingerprint(pr) {
  return JSON.stringify({
    state: pr.state,
    headRefOid: pr.headRefOid,
    mergeStateStatus: pr.mergeStateStatus,
    updatedAt: pr.updatedAt,
    bodyReactions: (pr.reactions?.nodes ?? [])
      .filter((reaction) => isCodexBotLogin(reaction.user?.login))
      .map((reaction) => [normalizeReaction(reaction.content), reaction.createdAt, reaction.user?.login]),
  });
}

function normalizeReaction(content) {
  return content === "+1" ? "THUMBS_UP" : content;
}

function codexPriority(body) {
  const priorities = [...String(body ?? "").matchAll(/\bP([0-3])\b/gi)]
    .map((match) => `P${match[1]}`);
  return highestCodexPriority(priorities);
}

function highestCodexPriority(priorities) {
  const ranks = priorities
    .filter(Boolean)
    .map((priority) => Number(String(priority).slice(1)))
    .filter(Number.isInteger);
  if (ranks.length === 0) return null;
  return `P${Math.min(...ranks)}`;
}

function compareByDateThenContent(a, b) {
  return String(a.createdAt).localeCompare(String(b.createdAt)) || a.content.localeCompare(b.content);
}

function codexStatusFromReactions(bodyReactions, statusFreshAfter) {
  const newestStatusReaction = bodyReactions
    .filter((reaction) => STATUS_REACTION_CONTENTS.has(reaction.content))
    .filter((reaction) => isFreshTimestamp(reaction.createdAt, statusFreshAfter))
    .at(-1);

  if (newestStatusReaction?.content === "THUMBS_UP") return "approved";
  if (newestStatusReaction?.content === "EYES") return "reviewing";
  if (bodyReactions.some((reaction) => isFreshTimestamp(reaction.createdAt, statusFreshAfter))) {
    return "other-reaction";
  }
  return "none";
}

function latestCodexReviewRequestAt(comments) {
  return newestTimestamp(
    ...comments
      .filter(isCodexReviewRequest)
      .map((comment) => comment.createdAt),
  );
}

function issueCommentsFromTimeline(items) {
  return items.filter((item) => item.__typename === "IssueComment");
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
  if (item.reviewedCommitOid) {
    return feedbackItemCoversCurrentHead(item, headRefOid, latestReviewRequestAt);
  }
  return isFreshTimestamp(item.updatedAt ?? item.createdAt, statusFreshAfter);
}

function feedbackItemCoversCurrentHead(item, headRefOid, latestReviewRequestAt) {
  return Boolean(item.reviewedCommitOid && headRefOid)
    && commitMatchesHead(item.reviewedCommitOid, headRefOid)
    && isFreshTimestamp(item.updatedAt ?? item.createdAt, latestReviewRequestAt);
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
      items.push({
        ...summarizeItem("pr_comment", comment, pr.viewerLogin),
        reviewedCommitOid: parseReviewedCommitOid(comment.body),
      });
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
    priority: codexPriority(item.body),
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
    status: summary.status,
    state: summary.state,
    bodyReactions: summary.bodyReactions.map((reaction) => `${reaction.content}:${reaction.createdAt}`),
    mergeStateStatus: summary.mergeStateStatus,
    feedbackItems: summary.feedbackItems.map((item) => [
      item.kind,
      item.id,
      item.state,
      item.updatedAt,
      item.hasBody,
      item.priority,
      item.validityReaction?.content,
      item.path,
      item.line,
    ]),
    activeCodexThreads: summary.activeCodexThreads.map((thread) => [
      thread.id,
      thread.path,
      thread.line,
      thread.priority,
      thread.comments.map((comment) => [comment.id, comment.updatedAt, comment.hasBody, comment.priority]),
    ]),
  });
}

function immediateEvent(snapshot, expectedHead) {
  const stateEvent = stateChangeEvent(null, snapshot, expectedHead);
  if (stateEvent) return stateEvent;
  if (snapshot.status === "approved") return "codex_approved";
  if (snapshot.freshFeedbackCount > 0 || snapshot.freshActiveCodexThreadCount > 0) return "codex_feedback_changed";
  if (dispositionedReviewIsComplete(snapshot)) return "codex_review_complete";
  return undefined;
}

function dispositionedReviewIsComplete(snapshot) {
  return dispositionedReviewCandidate(snapshot)
    && !snapshot.completionSnapshotTruncated;
}

function dispositionedReviewCandidate(snapshot) {
  return snapshot.status === "none"
    && snapshot.currentHeadFeedbackCount > 0
    && snapshot.currentHeadFeedbackCount === snapshot.dispositionedCurrentHeadFeedbackCount
    && snapshot.currentHeadActiveCodexThreadCount === 0;
}

function completionVerificationRequired(snapshot, options, precedingEvent) {
  return !precedingEvent
    && !options.fullHistory
    && snapshot.completionSnapshotTruncated
    && snapshot.status === "none"
    && snapshot.currentHeadFeedbackCount > 0
    && snapshot.currentHeadActiveCodexThreadCount === 0;
}

async function verifyDispositionedReviewEvidence(target, snapshot, options, precedingEvent) {
  if (!completionVerificationRequired(snapshot, options, precedingEvent)) return snapshot;
  return readSnapshotRateAware(target, { ...options, fullHistory: true });
}

function changeEvent(previous, current) {
  const stateEvent = stateChangeEvent(previous, current);
  if (stateEvent) return stateEvent;
  if (previous.status !== current.status) return "codex_status_changed";
  if (previous.fingerprint !== current.fingerprint) return "codex_feedback_changed";
  return undefined;
}

function stateChangeEvent(previous, current, expectedHead) {
  const currentMatchesExpected = expectedHead && commitMatchesHead(current.headRefOid, expectedHead);
  if (expectedHead && !currentMatchesExpected) return "pr_head_changed";
  if (!currentMatchesExpected && previous?.headRefOid !== undefined && previous.headRefOid !== current.headRefOid) {
    return "pr_head_changed";
  }
  if (previous?.state !== undefined && previous.state !== current.state) return "pr_state_changed";
  if (current.state !== "OPEN") return "pr_state_changed";
  if (previous?.mergeStateStatus !== undefined && previous.mergeStateStatus !== current.mergeStateStatus) {
    return "merge_state_changed";
  }
  if (["CONFLICTING", "DIRTY"].includes(current.mergeStateStatus)) return "merge_state_changed";
  return undefined;
}

function selectEvent(previous, current, expectedHead) {
  return stateChangeEvent(previous, current, expectedHead)
    ?? immediateEvent(current, expectedHead)
    ?? (previous ? changeEvent(previous, current) : undefined);
}

function slim(snapshot) {
  const {
    fingerprint: _fingerprint,
    feedbackItems,
    activeCodexThreads,
    freshFeedbackItems,
    freshActiveCodexThreads,
    ...rest
  } = snapshot;
  return {
    ...rest,
    // Public watcher output should hand fixers only fresh work. Total/stale counts remain for diagnostics.
    feedbackItems: freshFeedbackItems,
    activeCodexThreads: freshActiveCodexThreads,
    staleFeedbackCount: feedbackItems.length - freshFeedbackItems.length,
    staleActiveCodexThreadCount: activeCodexThreads.length - freshActiveCodexThreads.length,
  };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function watch(options) {
  const startedAt = Date.now();
  const intervalMs = options.intervalSeconds * 1000;
  const timeoutMs = options.timeoutSeconds * 1000;
  const rateAwareOptions = { ...options, deadlineMs: startedAt + timeoutMs };
  let target;
  let lastCheapStatus;
  let initial;
  let initialStateEvent;

  try {
    target = await resolveTarget(rateAwareOptions);
    if (!options.once) lastCheapStatus = await readCheapStatusRateAware(target, rateAwareOptions);
    initial = await readSnapshotRateAware(target, rateAwareOptions);
    if (!options.once) {
      initialStateEvent = stateChangeEvent(lastCheapStatus, initial, options.expectedHead);
      initial = await verifyDispositionedReviewEvidence(target, initial, rateAwareOptions, initialStateEvent);
      initialStateEvent = stateChangeEvent(lastCheapStatus, initial, options.expectedHead);
    }
  } catch (error) {
    if (!(error instanceof WatcherTimeoutError)) throw error;
    printResult({
      event: "timeout",
      target: target ?? null,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      polls: 0,
      previous: null,
      current: null,
      reason: error.message,
    });
    return;
  }

  if (options.once) {
    printResult({ event: "snapshot", target, current: slim(initial) });
    return;
  }

  const initialEvent = initialStateEvent ?? selectEvent(null, initial, options.expectedHead);
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
  let current = initial;
  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    await sleep(Math.min(intervalMs, Math.max(0, remainingMs)));
    polls += 1;

    let cheapStatus;
    try {
      cheapStatus = await readCheapStatusRateAware(target, rateAwareOptions);
    } catch (error) {
      if (!(error instanceof WatcherTimeoutError)) throw error;
      break;
    }
    if (
      !cheapStatusChanged(lastCheapStatus, cheapStatus)
      && current.currentHeadFeedbackCount === 0
      && current.currentHeadActiveCodexThreadCount === 0
    ) {
      lastCheapStatus = cheapStatus;
      continue;
    }
    lastCheapStatus = cheapStatus;

    try {
      current = await readSnapshotRateAware(target, rateAwareOptions);
      const precedingEvent = stateChangeEvent(initial, current, options.expectedHead);
      current = await verifyDispositionedReviewEvidence(target, current, rateAwareOptions, precedingEvent);
    } catch (error) {
      if (!(error instanceof WatcherTimeoutError)) throw error;
      break;
    }
    const event = selectEvent(initial, current, options.expectedHead);
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

  let final = current;
  let finalSnapshotError;
  const finalSnapshotOptions = {
    ...rateAwareOptions,
    deadlineMs: Date.now() + Math.min(intervalMs, 60 * 1000),
  };
  try {
    final = await readSnapshotRateAware(target, finalSnapshotOptions);
    const precedingEvent = stateChangeEvent(current, final, options.expectedHead);
    final = await verifyDispositionedReviewEvidence(target, final, finalSnapshotOptions, precedingEvent);
  } catch (error) {
    if (!(error instanceof WatcherTimeoutError)) throw error;
    finalSnapshotError = error.message;
  }

  const finalEvent = selectEvent(current, final, options.expectedHead);
  if (finalEvent) {
    printResult({
      event: finalEvent,
      target,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      polls,
      previous: slim(current),
      current: slim(final),
    });
    return;
  }

  printResult({
    event: "timeout",
    target,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    polls,
    previous: slim(initial),
    current: slim(final),
    finalSnapshotError,
  });
}

export { changeEvent, completionVerificationRequired, immediateEvent, selectEvent };

const isMain = process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  watch(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
