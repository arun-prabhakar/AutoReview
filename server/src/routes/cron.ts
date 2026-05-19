import { Router } from "express";
import crypto from "crypto";
import { getAutoReviewRepos, type RepositoryConfig } from "../services/repository-service.js";
import { findExistingReview, deleteReview } from "../services/storage-service.js";
import { fetchRecentCommits, fetchOpenPullRequests } from "../services/bitbucket-client.js";
import { getDecryptedPassword } from "../services/credential-service.js";
import { get } from "../db/queries.js";
import { runManualReview, runPrReview } from "../services/manual-review-service.js";
import { logger } from "../middleware/index.js";
import { getCronSecret } from "../config.js";

export const cronRouter = Router();

const lastSeenCommits = new Map<string, string>();

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

cronRouter.post("/auto-review", async (req, res) => {
  const secret = getCronSecret();
  const cronSecret = req.headers.authorization?.replace("Bearer ", "");
  if (!secret || !cronSecret || !safeEqual(cronSecret, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({ status: "started" });

  try {
    await pollAllRepos();
    logger.info("Cron auto-review completed");
  } catch (error) {
    logger.error("Cron auto-review failed", { error: String(error) });
  }
});

async function pollAllRepos(): Promise<void> {
  const repos = await getAutoReviewRepos();
  for (const repo of repos) {
    try {
      await pollRepo(repo);
    } catch (error) {
      logger.error(`Auto-review polling failed for repo ${repo.name}`, { error: String(error) });
    }
  }
}

async function pollRepo(repo: RepositoryConfig): Promise<void> {
  const password = await getDecryptedPassword(repo.credential_id);
  const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = $1", [repo.credential_id]);
  if (!credential) return;

  const tasks: Promise<void>[] = [];

  if (repo.trigger_on_commit) {
    tasks.push(pollCommits(repo, password, credential.username));
  }

  if (repo.trigger_on_pr_update) {
    tasks.push(pollPullRequests(repo, password, credential.username));
  }

  await Promise.all(tasks);
}

async function pollCommits(repo: RepositoryConfig, password: string, username: string): Promise<void> {
  const commits = await fetchRecentCommits(repo.workspace, repo.slug, repo.branch || "main", password, username);
  if (commits.length === 0) return;

  const cursor = lastSeenCommits.get(repo.id);
  let newCommits = commits;

  if (cursor) {
    const cursorIndex = commits.findIndex(c => c.hash === cursor);
    if (cursorIndex === -1) {
      newCommits = [commits[0]];
    } else if (cursorIndex === 0) {
      return;
    } else {
      newCommits = commits.slice(0, cursorIndex);
    }
  }

  for (const commit of newCommits) {
    const existing = await findExistingReview(repo.id, commit.hash);
    if (!existing || existing.status === "failed") {
      try {
        await runManualReview(repo.id, commit.hash);
      } catch (error) {
        logger.error(`Auto-review failed for commit`, { repoId: repo.id, commit: commit.hash, error: String(error) });
      }
    }
  }

  lastSeenCommits.set(repo.id, commits[0].hash);
}

async function pollPullRequests(repo: RepositoryConfig, password: string, username: string): Promise<void> {
  const prs = await fetchOpenPullRequests(repo.workspace, repo.slug, password, username);

  for (const pr of prs) {
    if (!pr.commitHash) continue;

    const dedupKey = `pr:${pr.id}:${pr.commitHash}`;
    const existing = await findExistingReview(repo.id, dedupKey);

    if (existing) {
      if (existing.status === "failed") {
        await deleteReview(existing.id);
      } else {
        continue;
      }
    }

    try {
      await runPrReview(repo.id, pr.id);
    } catch (error) {
      logger.error(`Auto-review failed for PR`, { repoId: repo.id, prId: pr.id, error: String(error) });
    }
  }
}
