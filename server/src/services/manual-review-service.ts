import { findExistingReview, findFindingsByReviewId, createReview, updateReviewStatus, insertFindings, deleteReview } from "./storage-service.js";
import { fetchCommitDiff, fetchPrDiff, findPullRequestForCommit, postPrComment, type CommitInfo } from "./bitbucket-client.js";
import { getRepoById, type RepositoryConfig } from "./repository-service.js";
import { getDecryptedPassword } from "./credential-service.js";
import { getDecryptedApiKey, getProviderById } from "./provider-service.js";
import { analyzeDiff, extractFilePaths, generateDiffOverview, type RawFinding, type ProviderConfig } from "./review-engine.js";
import { sendReviewEmail } from "./email-draft-service.js";
import { get } from "../db/queries.js";
import { v4 as uuid } from "uuid";
import { logger } from "../middleware/index.js";

type DedupKey = string;
type ReviewMode = "manual" | "pr";

interface ReviewContext {
  repo: RepositoryConfig;
  diff: string;
  commit: CommitInfo;
  truncated: boolean;
  dedupKey: DedupKey;
  reviewMode: ReviewMode;
  prId?: string;
}

async function resolveCredentials(repo: RepositoryConfig): Promise<{ password: string; username: string }> {
  const password = await getDecryptedPassword(repo.credential_id);
  const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = $1", [repo.credential_id]);
  if (!credential) throw new Error("Credential not found");
  return { password, username: credential.username };
}

async function resolveProvider(repo: RepositoryConfig): Promise<ProviderConfig> {
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
    "SELECT content FROM prompt_templates WHERE strictness = $1 OR strictness = 'all' ORDER BY strictness DESC LIMIT 1",
    [strictness]
  );
  return template?.content || "Review the following code diff and provide findings.";
}

async function performDedup(repositoryId: string, dedupKey: string, force: boolean) {
  const existing = await findExistingReview(repositoryId, dedupKey);
  if (!existing) return { action: "proceed" as const };

  if (existing.status === "completed") {
    if (!force) {
      const findings = await findFindingsByReviewId(existing.id);
      return { action: "cached" as const, review: existing, findings };
    }
    await deleteReview(existing.id);
  } else if (existing.status === "pending") {
    return { action: "in_progress" as const, review: existing };
  } else if (existing.status === "failed") {
    await deleteReview(existing.id);
  }
  return { action: "proceed" as const };
}

async function executeReview(ctx: ReviewContext, createdBy?: string) {
  const reviewId = uuid();
  await createReview({
    id: reviewId,
    repository_id: ctx.repo.id,
    commit_hash: ctx.dedupKey,
    branch: ctx.repo.branch,
    status: "pending",
    strictness: ctx.repo.strictness,
    review_mode: ctx.reviewMode,
    error_message: null,
    completed_at: null,
    created_by: createdBy ?? null,
  });

  try {
    const template = await getPromptTemplate(ctx.repo.strictness);
    const provider = await resolveProvider(ctx.repo);
    const { findings, incomplete } = await analyzeDiff(ctx.diff, ctx.commit, ctx.repo, template, provider, ctx.truncated);

    let aiOverview = "";
    try {
      aiOverview = await generateDiffOverview(ctx.diff, ctx.commit, ctx.repo, provider);
    } catch (err) {
      logger.warn(`Failed to generate AI overview for ${ctx.dedupKey}`, { error: String(err) });
      aiOverview = ctx.reviewMode === "pr" && ctx.prId
        ? `PR #${ctx.prId}`
        : `Changes in commit ${ctx.dedupKey.substring(0, 12)}: ${ctx.commit.message}`;
    }

    await insertFindings(reviewId, findings);
    await updateReviewStatus(
      reviewId,
      "completed",
      incomplete ? "Review incomplete: diff was truncated due to size" : undefined,
      aiOverview
    );

    return { reviewId, findings, cached: false, incomplete, aiOverview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateReviewStatus(reviewId, "failed", message);
    if (message.includes("CREDENTIAL_EXPIRED")) {
      logger.error(`ALERT: Credential expired for repo ${ctx.repo.name}`, { repoId: ctx.repo.id });
    }
    throw error;
  }
}

async function sendNotifications(
  ctx: ReviewContext,
  reviewId: string,
  findings: RawFinding[],
  aiOverview: string,
  password: string,
  username: string
) {
  const tasks: Promise<void>[] = [];
  const changedFiles = extractFilePaths(ctx.diff).split("\n").filter(Boolean);

  if (ctx.repo.generate_email) {
    tasks.push(
      sendReviewEmail(ctx.repo.id, ctx.repo.name, findings, aiOverview, changedFiles).catch((err) => {
        logger.error(`Failed to send review email`, { reviewId, error: err.message });
      })
    );
  }

  if (ctx.repo.post_to_bitbucket && ctx.prId) {
    tasks.push(
      postPrComment(ctx.repo.workspace, ctx.repo.slug, ctx.prId, formatPrComment(findings), password, username).catch((err) => {
        logger.error(`Failed to post PR comment`, { prId: ctx.prId, error: String(err) });
      })
    );
  } else if (ctx.repo.post_to_bitbucket && ctx.reviewMode === "manual") {
    tasks.push(
      (async () => {
        try {
          const prId = await findPullRequestForCommit(ctx.repo.workspace, ctx.repo.slug, ctx.dedupKey, password, username);
          if (prId) {
            await postPrComment(ctx.repo.workspace, ctx.repo.slug, prId, formatPrComment(findings), password, username);
          }
        } catch (err) {
          logger.error(`Failed to post PR comment`, { commitHash: ctx.dedupKey, error: String(err) });
        }
      })()
    );
  }

  await Promise.all(tasks);
}

function formatPrComment(findings: RawFinding[]): string {
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

export async function runManualReview(repositoryId: string, commitHash: string, force = false, createdBy?: string) {
  const repo = await getRepoById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  const { password, username } = await resolveCredentials(repo);

  const { diff, commit, truncated } = await fetchCommitDiff(
    repo.workspace, repo.slug, commitHash, password, username
  );

  const dedupKey = commit.hash;
  const dedupResult = await performDedup(repositoryId, dedupKey, force);
  if (dedupResult.action === "cached") return { review: dedupResult.review, findings: dedupResult.findings, cached: true, reviewId: dedupResult.review.id };
  if (dedupResult.action === "in_progress") return { review: dedupResult.review, findings: [], cached: false, message: "Review already in progress" };

  const ctx: ReviewContext = { repo, diff, commit, truncated, dedupKey, reviewMode: "manual" };
  const result = await executeReview(ctx, createdBy);

  await sendNotifications(ctx, result.reviewId, result.findings, result.aiOverview, password, username);

  return result;
}

export async function runPrReview(repositoryId: string, prId: string, force = false, createdBy?: string) {
  const dedupKey = `pr:${prId}`;

  const dedupResult = await performDedup(repositoryId, dedupKey, force);
  if (dedupResult.action === "cached") return { review: dedupResult.review, findings: dedupResult.findings, cached: true, reviewId: dedupResult.review.id };
  if (dedupResult.action === "in_progress") return { review: dedupResult.review, findings: [], cached: false, message: "Review already in progress" };

  const repo = await getRepoById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  const { password, username } = await resolveCredentials(repo);

  const { diff, pr, truncated } = await fetchPrDiff(repo.workspace, repo.slug, prId, password, username);

  const syntheticCommit: CommitInfo = {
    hash: pr.commitHash,
    message: `PR #${pr.id}: ${pr.title}`,
    date: pr.updatedOn,
    author: { raw: pr.author },
  };

  const ctx: ReviewContext = { repo, diff, commit: syntheticCommit, truncated, dedupKey, reviewMode: "pr", prId };
  const result = await executeReview(ctx, createdBy);

  await sendNotifications(ctx, result.reviewId, result.findings, result.aiOverview, password, username);

  return { ...result, pr };
}
