import { getAutoReviewRepos, type RepositoryConfig } from "./repository-service.js";
import { findExistingReview } from "./storage-service.js";
import { fetchRecentCommits, fetchOpenPullRequests } from "./bitbucket-client.js";
import { getDecryptedPassword } from "./credential-service.js";
import { get } from "../db/queries.js";
import { runManualReview } from "./manual-review-service.js";
import { logger } from "../middleware/index.js";

let pollingTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoReviewPolling(): void {
  (async () => {
    const repos = await getAutoReviewRepos();
    if (repos.length === 0) return;

    const minInterval = Math.min(...repos.map((r) => r.poll_interval_minutes));
    const intervalMs = minInterval * 60 * 1000;

    pollingTimer = setInterval(async () => {
      await pollAllRepos();
    }, intervalMs);

    await pollAllRepos();
  })();
}

export function stopAutoReviewPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

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
  const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = ?", [repo.credential_id]);
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
  const commits = await fetchRecentCommits(repo.workspace, repo.slug, repo.branch, password, username);

  for (const commit of commits) {
    const existing = await findExistingReview(repo.id, commit.hash);
    if (!existing || existing.status === "failed") {
      await runManualReview(repo.id, commit.hash);
    }
  }
}

async function pollPullRequests(repo: RepositoryConfig, password: string, username: string): Promise<void> {
  const prs = await fetchOpenPullRequests(repo.workspace, repo.slug, password, username);

  for (const pr of prs) {
    if (!pr.commitHash) continue;
    const existing = await findExistingReview(repo.id, pr.commitHash);
    if (!existing || (existing.status === "failed")) {
      await runManualReview(repo.id, pr.commitHash);
    }
  }
}
