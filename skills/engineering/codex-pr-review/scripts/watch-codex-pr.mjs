#!/usr/bin/env node

import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BOT_LOGIN = "chatgpt-codex-connector[bot]";
const DEFAULT_INTERVAL_SECONDS = 20;
const DEFAULT_TIMEOUT_SECONDS = 1800;
const MAX_BUFFER = 10 * 1024 * 1024;

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
            committedDate
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
          author {
            login
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

function help() {
  return `Usage: watch-codex-pr.mjs [options]

Poll a GitHub PR until Codex PR status, Codex feedback, or merge state changes.
Requires the GitHub CLI to be installed and authenticated.

Options:
  --pr <number|url>       PR number, URL, or branch. Default: current branch PR.
  --repo <owner/name>     Repository. Default: current gh repo.
  --interval <seconds>    Poll interval. Default: ${DEFAULT_INTERVAL_SECONDS}.
  --timeout <seconds>     Maximum time to wait. Default: ${DEFAULT_TIMEOUT_SECONDS}.
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
    if (["--pr", "--repo", "--interval", "--timeout"].includes(arg)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      i += 1;
      if (arg === "--pr") options.pr = value;
      if (arg === "--repo") options.repo = value;
      if (arg === "--interval") options.intervalSeconds = parsePositiveSeconds(arg, value);
      if (arg === "--timeout") options.timeoutSeconds = parsePositiveSeconds(arg, value);
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

async function ghJson(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: MAX_BUFFER });
  return JSON.parse(stdout);
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
  return pr;
}

async function readSnapshot(target) {
  const pr = await readPullRequestPage(target);
  pr.reactions = await readConnectionPages(target, pr.reactions, "reactions", "reactionCursor");
  pr.comments = await readConnectionPages(target, pr.comments, "comments", "commentCursor");
  pr.reviews = await readConnectionPages(target, pr.reviews, "reviews", "reviewCursor");
  pr.reviewThreads = await readConnectionPages(target, pr.reviewThreads, "reviewThreads", "threadCursor");

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

function summarize(pr) {
  const headCommit = (pr.commits?.nodes ?? []).at(-1)?.commit;
  const latestReviewRequestAt = latestCodexReviewRequestAt(pr.comments?.nodes ?? []);
  const statusFreshAfter = newestTimestamp(headCommit?.committedDate, latestReviewRequestAt);
  const bodyReactions = (pr.reactions?.nodes ?? [])
    .filter((reaction) => reaction.user?.login === BOT_LOGIN)
    .map((reaction) => ({
      content: normalizeReaction(reaction.content),
      createdAt: reaction.createdAt,
    }))
    .sort(compareByDateThenContent);

  const status = codexStatusFromReactions(bodyReactions, statusFreshAfter);

  const feedbackItems = collectFeedbackItems(pr);
  const activeCodexThreads = (pr.reviewThreads?.nodes ?? [])
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .filter((thread) => (thread.comments?.nodes ?? []).some((comment) => comment.author?.login === BOT_LOGIN))
    .map((thread) => ({
      id: thread.id,
      path: thread.path,
      line: thread.line,
      comments: (thread.comments?.nodes ?? [])
        .filter((comment) => comment.author?.login === BOT_LOGIN)
        .map((comment) => summarizeItem("thread_comment", comment)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const freshFeedbackItems = feedbackItems.filter((item) =>
    feedbackItemIsFresh(item, statusFreshAfter, pr.headRefOid, latestReviewRequestAt),
  );
  const freshActiveCodexThreads = activeCodexThreads.filter((thread) =>
    thread.comments.some((comment) =>
      feedbackItemIsFresh(comment, statusFreshAfter, pr.headRefOid, latestReviewRequestAt),
    ),
  );

  return {
    number: pr.number,
    url: pr.url,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    headCommit: headCommit
      ? {
          oid: headCommit.oid,
          committedDate: headCommit.committedDate,
        }
      : null,
    baseRefName: pr.baseRefName,
    mergeStateStatus: pr.mergeStateStatus,
    latestReviewRequestAt,
    statusFreshAfter,
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
      statusFreshAfter,
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
      .filter((comment) => /^\s*@codex\s+review\s*$/i.test(comment.body ?? ""))
      .map((comment) => comment.createdAt),
  );
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
  return !Number.isNaN(value) && !Number.isNaN(boundary) && value > boundary;
}

function feedbackItemIsFresh(item, statusFreshAfter, headRefOid, latestReviewRequestAt) {
  if (item.reviewedCommitOid && headRefOid) {
    const matchesHead = headRefOid.startsWith(item.reviewedCommitOid) || item.reviewedCommitOid.startsWith(headRefOid);
    return matchesHead && isFreshTimestamp(item.updatedAt ?? item.createdAt, latestReviewRequestAt);
  }
  return isFreshTimestamp(item.updatedAt ?? item.createdAt, statusFreshAfter);
}

function collectFeedbackItems(pr) {
  const items = [];

  for (const comment of pr.comments?.nodes ?? []) {
    if (comment.author?.login === BOT_LOGIN) items.push(summarizeItem("pr_comment", comment));
  }

  for (const review of pr.reviews?.nodes ?? []) {
    if (review.author?.login === BOT_LOGIN) {
      items.push({
        kind: "review",
        id: review.id,
        url: review.url,
        state: review.state,
        updatedAt: review.submittedAt,
        hasBody: Boolean(review.body?.trim()),
        reviewedCommitOid: parseReviewedCommitOid(review.body),
      });
    }
    for (const comment of review.comments?.nodes ?? []) {
      if (comment.author?.login === BOT_LOGIN) {
        items.push({
          ...summarizeItem("review_comment", comment),
          path: comment.path,
          line: comment.line,
          originalLine: comment.originalLine,
        });
      }
    }
  }

  return items.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function parseReviewedCommitOid(body) {
  return body?.match(/Reviewed commit:\*\*\s*`([0-9a-f]{7,40})`/i)?.[1]
    ?? body?.match(/Reviewed commit:\s*`([0-9a-f]{7,40})`/i)?.[1]
    ?? null;
}

function summarizeItem(kind, item) {
  return {
    kind,
    id: item.id,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    hasBody: Boolean(item.body?.trim()),
  };
}

function fingerprint(summary) {
  return JSON.stringify({
    headRefOid: summary.headRefOid,
    statusFreshAfter: summary.statusFreshAfter,
    status: summary.status,
    bodyReactions: summary.bodyReactions.map((reaction) => `${reaction.content}:${reaction.createdAt}`),
    mergeStateStatus: summary.mergeStateStatus,
    feedbackItems: summary.feedbackItems.map((item) => [
      item.kind,
      item.id,
      item.state,
      item.updatedAt,
      item.hasBody,
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
  const initial = await readSnapshot(target);

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

    const current = await readSnapshot(target);
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

  const current = await readSnapshot(target);
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
