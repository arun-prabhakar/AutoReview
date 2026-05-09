import { findExistingReview, findFindingsByReviewId, createReview, updateReviewStatus, insertFindings, deleteReview } from "./storage-service.js";
import { fetchCommitDiff, fetchPrDiff, findPullRequestForCommit, postPrComment } from "./bitbucket-client.js";
import { getRepoById, type RepositoryConfig } from "./repository-service.js";
import { getDecryptedPassword } from "./credential-service.js";
import { getDecryptedApiKey, getProviderById } from "./provider-service.js";
import { analyzeDiff, extractFilePaths, generateDiffOverview } from "./review-engine.js";
import { sendReviewEmail } from "./email-draft-service.js";
import { get } from "../db/queries.js";
import { v4 as uuid } from "uuid";
import { logger } from "../middleware/index.js";

export async function runManualReview(repositoryId: string, commitHash: string, force = false, createdBy?: string) {
  const repo = await getRepoById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  const password = await getDecryptedPassword(repo.credential_id);
  const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = ?", [repo.credential_id]);
  if (!credential) throw new Error("Credential not found");

  // Fetch commit from Bitbucket to resolve any partial/short hash to the canonical full hash.
  // This prevents the same commit reviewed with different hash lengths from creating duplicate reviews.
  const { diff, commit, truncated } = await fetchCommitDiff(
    repo.workspace, repo.slug, commitHash, password, credential.username
  );
  const fullHash = commit.hash;

  // Dedup check always uses the canonical full hash
  const existing = await findExistingReview(repositoryId, fullHash);
  if (existing) {
    if (existing.status === "completed") {
      if (!force) {
        const findings = await findFindingsByReviewId(existing.id);
        return { review: existing, findings, cached: true, reviewId: existing.id };
      }
      await deleteReview(existing.id);
    } else if (existing.status === "pending") {
      return { review: existing, findings: [], cached: false, message: "Review already in progress" };
    } else if (existing.status === "failed") {
      await deleteReview(existing.id);
    }
  }

  const reviewId = uuid();
  await createReview({
    id: reviewId,
    repository_id: repo.id,
    commit_hash: fullHash,
    branch: repo.branch,
    status: "pending",
    strictness: repo.strictness,
    review_mode: "manual",
    error_message: null,
    completed_at: null,
    created_by: createdBy ?? null,
  });

  try {
    const template = await getPromptTemplate(repo.strictness);
    const provider = await resolveProvider(repo);
    const { findings, incomplete } = await analyzeDiff(diff, commit, repo, template, provider, truncated);

    let aiOverview = "";
    try {
      aiOverview = await generateDiffOverview(diff, commit, repo, provider);
    } catch (err) {
      logger.warn(`Failed to generate AI overview for ${fullHash}`, { error: String(err) });
      aiOverview = `Changes in commit ${fullHash.substring(0, 12)}: ${commit.message}`;
    }

    await insertFindings(reviewId, findings);
    await updateReviewStatus(
      reviewId,
      "completed",
      incomplete ? "Review incomplete: diff was truncated due to size" : undefined,
      aiOverview
    );

    await sendCommitNotifications(repo, fullHash, findings, diff, commit, password, credential.username, aiOverview);

    return { reviewId, findings, cached: false, incomplete, aiOverview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateReviewStatus(reviewId, "failed", message);
    if (message.includes("CREDENTIAL_EXPIRED")) {
      logger.error(`ALERT: Credential expired for repo ${repo.name}`, { repoId: repo.id });
    }
    throw error;
  }
}

export async function runPrReview(repositoryId: string, prId: string, force = false, createdBy?: string) {
  const dedupKey = `pr:${prId}`;

  const existing = await findExistingReview(repositoryId, dedupKey);
  if (existing) {
    if (existing.status === "completed") {
      if (!force) {
        const findings = await findFindingsByReviewId(existing.id);
        return { review: existing, findings, cached: true, reviewId: existing.id };
      }
      await deleteReview(existing.id);
    } else if (existing.status === "pending") {
      return { review: existing, findings: [], cached: false, message: "Review already in progress" };
    } else if (existing.status === "failed") {
      await deleteReview(existing.id);
    }
  }

  const repo = await getRepoById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  const password = await getDecryptedPassword(repo.credential_id);
  const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = ?", [repo.credential_id]);
  if (!credential) throw new Error("Credential not found");

  const { diff, pr, truncated } = await fetchPrDiff(repo.workspace, repo.slug, prId, password, credential.username);

  const syntheticCommit = {
    hash: pr.commitHash,
    message: `PR #${pr.id}: ${pr.title}`,
    date: pr.updatedOn,
    author: { raw: pr.author },
  };

  const reviewId = uuid();
  await createReview({
    id: reviewId,
    repository_id: repo.id,
    commit_hash: dedupKey,
    branch: repo.branch,
    status: "pending",
    strictness: repo.strictness,
    review_mode: "pr",
    error_message: null,
    completed_at: null,
    created_by: createdBy ?? null,
  });

  try {
    const template = await getPromptTemplate(repo.strictness);
    const provider = await resolveProvider(repo);
    const { findings, incomplete } = await analyzeDiff(diff, syntheticCommit, repo, template, provider, truncated);

    let aiOverview = "";
    try {
      aiOverview = await generateDiffOverview(diff, syntheticCommit, repo, provider);
    } catch (err) {
      logger.warn(`Failed to generate AI overview for PR #${prId}`, { error: String(err) });
      aiOverview = `PR #${pr.id}: ${pr.title}`;
    }

    await insertFindings(reviewId, findings);
    await updateReviewStatus(
      reviewId,
      "completed",
      incomplete ? "Review incomplete: diff was truncated due to size" : undefined,
      aiOverview
    );

    const changedFiles = extractFilePaths(diff).split("\n").filter(Boolean);

    if (repo.generate_email) {
      sendReviewEmail(repo.id, repo.name, findings, aiOverview, changedFiles).catch((err) => {
        logger.error(`Failed to send PR review email`, { prId, error: err.message });
      });
    }

    if (repo.post_to_bitbucket) {
      postPrComment(repo.workspace, repo.slug, prId, formatPrComment(findings), password, credential.username).catch((err) => {
        logger.error(`Failed to post PR comment`, { prId, error: String(err) });
      });
    }

    return { reviewId, findings, cached: false, incomplete, pr, aiOverview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateReviewStatus(reviewId, "failed", message);
    throw error;
  }
}

async function sendCommitNotifications(
  repo: RepositoryConfig,
  fullHash: string,
  findings: import("./review-engine.js").RawFinding[],
  diff: string,
  commit: import("./bitbucket-client.js").CommitInfo,
  appPassword: string,
  username: string,
  aiOverview: string
) {
  const tasks: Promise<void>[] = [];

  if (repo.generate_email) {
    const changedFiles = extractFilePaths(diff).split("\n").filter(Boolean);
    tasks.push(
      sendReviewEmail(repo.id, repo.name, findings, aiOverview, changedFiles).catch((err) => {
        logger.error(`Failed to send email for review`, { commitHash: fullHash, error: err.message });
      })
    );
  }

  if (repo.post_to_bitbucket) {
    tasks.push(
      (async () => {
        try {
          const prId = await findPullRequestForCommit(repo.workspace, repo.slug, fullHash, appPassword, username);
          if (prId) {
            await postPrComment(repo.workspace, repo.slug, prId, formatPrComment(findings), appPassword, username);
          }
        } catch (err) {
          logger.error(`Failed to post PR comment`, { commitHash: fullHash, error: String(err) });
        }
      })()
    );
  }

  await Promise.all(tasks);
}

function formatPrComment(findings: import("./review-engine.js").RawFinding[]): string {
  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  let body = `**AutoReview — Code Review Findings**\n\n`;
  body += `**Must Fix:** ${grouped.must_fix.length} | **Should Fix Soon:** ${grouped.should_fix_soon.length} | **Ignore:** ${grouped.ignore.length}\n\n`;

  for (const [level, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    body += `### ${level.replace("_", " ").toUpperCase()}\n\n`;
    for (const f of items) {
      body += `- **${f.summary}** — \`${f.file_path}${f.line_number ? `:${f.line_number}` : ""}\`\n`;
      body += `  ${f.explanation}\n`;
      if (f.suggested_fix) body += `  **Fix:** ${f.suggested_fix}\n`;
      body += "\n";
    }
  }

  return body;
}

async function resolveProvider(repo: RepositoryConfig): Promise<{ apiBase: string; apiKey: string }> {
  if (!repo.llm_provider_id) {
    throw new Error(`No LLM provider configured for repository ${repo.name}`);
  }
  const provider = await getProviderById(repo.llm_provider_id);
  if (!provider) {
    throw new Error(`LLM provider ${repo.llm_provider_id} not found`);
  }
  const apiKey = await getDecryptedApiKey(repo.llm_provider_id);
  return { apiBase: provider.api_base, apiKey };
}

async function getPromptTemplate(strictness: string): Promise<string> {
  const template = await get<{ content: string }>(
    "SELECT content FROM prompt_templates WHERE strictness = ? OR strictness = 'all' ORDER BY strictness DESC LIMIT 1",
    [strictness]
  );
  return template?.content || "Review the following code diff and provide findings.";
}
