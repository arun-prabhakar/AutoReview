import { findExistingReview, findFindingsByReviewId, createReview, updateReviewStatus, insertFindings, deleteReview, createNotification, getReviewChain, findSimilarOpenFindings, linkFindings, type RawFindingInput } from "./storage-service.js";
import { fetchCommitDiff, fetchPrDiff, findPullRequestForCommit, postPrComment, postInlinePrComment, fetchFileFromRepo, type CommitInfo } from "./bitbucket-client.js";
import { getRepoById, type RepositoryConfig } from "./repository-service.js";
import { getDecryptedPassword } from "./credential-service.js";
import { getDecryptedApiKey, getProviderById } from "./provider-service.js";
import { analyzeDiff, extractFilePaths, generateDiffOverview, multiPassReview, type RawFinding, type ProviderConfig } from "./review-engine.js";
import { sendReviewEmail, type ReviewMetadata } from "./email-draft-service.js";
import { all, get } from "../db/queries.js";
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

async function performDedup(repositoryId: string, dedupKey: string, force: boolean, parentReviewId?: string) {
  if (parentReviewId) return { action: "proceed" as const, parentReviewId };

  const existing = await findExistingReview(repositoryId, dedupKey);
  if (!existing) return { action: "proceed" as const };

  if (existing.status === "completed") {
    if (!force) {
      const findings = await findFindingsByReviewId(existing.id);
      return { action: "cached" as const, review: existing, findings };
    }
    return { action: "proceed" as const, parentReviewId: existing.id };
  } else if (existing.status === "pending") {
    return { action: "in_progress" as const, review: existing };
  } else if (existing.status === "failed") {
    await deleteReview(existing.id);
  }
  return { action: "proceed" as const };
}

async function executeReview(ctx: ReviewContext, createdBy?: string, parentReviewId?: string) {
  const reviewId = uuid();

  let projectContext: string | undefined;
  try {
    const { password, username } = await resolveCredentials(ctx.repo);
    projectContext = await fetchFileFromRepo(
      ctx.repo.workspace, ctx.repo.slug, ".autoreview.md", ctx.repo.branch, password, username
    ) ?? undefined;
  } catch (err) {
    logger.warn(`Failed to fetch .autoreview.md`, { error: String(err) });
  }

  const { created } = await createReview({
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
    parent_review_id: parentReviewId ?? null,
    tokens_prompt: null,
    tokens_completion: null,
    tokens_total: null,
    estimated_cost: null,
    project_context: projectContext ?? null,
    commit_author: ctx.commit.author?.raw ?? null,
  });

  if (!created) {
    const existing = await findExistingReview(ctx.repo.id, ctx.dedupKey);
    if (existing) {
      const findings = await findFindingsByReviewId(existing.id);
      return { reviewId: existing.id, findings, cached: true, incomplete: false, aiOverview: existing.ai_overview || "" };
    }
  }

  try {
    const template = await getPromptTemplate(ctx.repo.strictness);
    const provider = await resolveProvider(ctx.repo);

    let rawFindings: RawFinding[];
    let incomplete: boolean;
    let tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };

    if (ctx.repo.multi_pass_review) {
      const multiResult = await multiPassReview(ctx.diff, ctx.commit, ctx.repo, template, provider, ctx.truncated, projectContext);
      rawFindings = multiResult.findings;
      incomplete = ctx.truncated;
      tokenUsage = multiResult.tokenUsage;
    } else {
      const singleResult = await analyzeDiff(ctx.diff, ctx.commit, ctx.repo, template, provider, ctx.truncated, projectContext);
      rawFindings = singleResult.findings;
      incomplete = singleResult.incomplete;
      tokenUsage = singleResult.tokenUsage;
    }

    const findings = rawFindings.map((f) => ({
      file_path: f.file_path,
      line_number: f.line_number,
      summary: f.summary,
      explanation: f.explanation,
      risk_level: f.risk_level,
      suggested_fix: f.suggested_fix,
      category: f.category,
    }));

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

    const newFindingIds = await linkDuplicateFindings(ctx.repo.id, findings);
    if (newFindingIds.length > 0) {
      logger.info(`Linked ${newFindingIds.length} findings to existing persistent issues for ${ctx.repo.name}`);
    }

    const modelCostPerToken = estimateCost(ctx.repo.llm_model, tokenUsage);
    await updateReviewStatus(
      reviewId,
      "completed",
      incomplete ? "Review incomplete: diff was truncated due to size" : undefined,
      aiOverview,
      {
        tokens_prompt: tokenUsage.prompt_tokens,
        tokens_completion: tokenUsage.completion_tokens,
        tokens_total: tokenUsage.total_tokens,
        estimated_cost: modelCostPerToken,
      }
    );

    return { reviewId, findings, cached: false, incomplete, aiOverview, tokenUsage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateReviewStatus(reviewId, "failed", message);
    if (message.includes("CREDENTIAL_EXPIRED")) {
      logger.error(`ALERT: Credential expired for repo ${ctx.repo.name}`, { repoId: ctx.repo.id });
    }
    throw error;
  }
}

function estimateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  if (model.includes("gpt-4o")) return (prompt * 2.5 + completion * 10) / 1_000_000;
  if (model.includes("gpt-4")) return (prompt * 30 + completion * 60) / 1_000_000;
  if (model.includes("gpt-3.5")) return (prompt * 0.5 + completion * 1.5) / 1_000_000;
  if (model.includes("claude-3")) return (prompt * 3 + completion * 15) / 1_000_000;
  if (model.includes("gemini")) return (prompt * 1.25 + completion * 5) / 1_000_000;
  return (prompt * 3 + completion * 10) / 1_000_000;
}

async function sendNotifications(
  ctx: ReviewContext,
  reviewId: string,
  findings: RawFinding[],
  aiOverview: string,
  password: string,
  username: string,
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
) {
  const tasks: Promise<void>[] = [];
  const changedFiles = extractFilePaths(ctx.diff).split("\n").filter(Boolean);
  const mustFixCount = findings.filter((f) => f.risk_level === "must_fix").length;

  if (ctx.repo.generate_email) {
    const emailMetadata: ReviewMetadata = {
      repoName: ctx.repo.name,
      commitHash: ctx.dedupKey.startsWith("pr:") ? undefined : ctx.dedupKey,
      prId: ctx.prId,
      branch: ctx.repo.branch,
      strictness: ctx.repo.strictness,
      reviewMode: ctx.reviewMode,
      reviewedBy: ctx.repo.llm_model,
      model: ctx.repo.llm_model,
      tokensUsed: tokenUsage?.total_tokens,
      estimatedCost: tokenUsage ? estimateCost(ctx.repo.llm_model, tokenUsage) : undefined,
    };
    tasks.push(
      sendReviewEmail(ctx.repo.id, ctx.repo.name, findings, aiOverview, changedFiles, ctx.diff, emailMetadata).catch((err) => {
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
    for (const f of findings) {
      if (f.line_number && (f.risk_level === "must_fix" || f.risk_level === "should_fix_soon")) {
        tasks.push(
          postInlinePrComment(
            ctx.repo.workspace, ctx.repo.slug, ctx.prId!,
            f.file_path, f.line_number,
            `**${f.risk_level === "must_fix" ? "🔴 Must Fix" : "🟡 Should Fix"}**: ${f.summary}\n\n${f.explanation}${f.suggested_fix ? `\n\n**Suggested fix:** ${f.suggested_fix}` : ""}`,
            password, username
          ).catch(() => {})
        );
      }
    }
  } else if (ctx.repo.post_to_bitbucket && ctx.reviewMode === "manual") {
    tasks.push(
      (async () => {
        try {
          const prId = await findPullRequestForCommit(ctx.repo.workspace, ctx.repo.slug, ctx.dedupKey, password, username);
          if (prId) {
            await postPrComment(ctx.repo.workspace, ctx.repo.slug, prId, formatPrComment(findings), password, username);
            for (const f of findings) {
              if (f.line_number && (f.risk_level === "must_fix" || f.risk_level === "should_fix_soon")) {
                await postInlinePrComment(
                  ctx.repo.workspace, ctx.repo.slug, prId,
                  f.file_path, f.line_number,
                  `**${f.risk_level === "must_fix" ? "🔴 Must Fix" : "🟡 Should Fix"}**: ${f.summary}\n\n${f.explanation}${f.suggested_fix ? `\n\n**Suggested fix:** ${f.suggested_fix}` : ""}`,
                  password, username
                ).catch(() => {});
              }
            }
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

async function linkDuplicateFindings(repositoryId: string, findings: RawFindingInput[]): Promise<string[]> {
  const linked: string[] = [];
  for (const f of findings) {
    try {
      const similar = await findSimilarOpenFindings(repositoryId, f.file_path, f.category, f.summary);
      if (similar.length > 0) {
        linked.push(f.file_path);
      }
    } catch { /* ignore dedup failures */ }
  }
  return linked;
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
  const result = await executeReview(ctx, createdBy, dedupResult.parentReviewId);

  await sendNotifications(ctx, result.reviewId, result.findings, result.aiOverview, password, username, result.tokenUsage);
  await notifyReviewComplete(repo.id, result.reviewId, repo.name, result.findings, createdBy);

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
  const result = await executeReview(ctx, createdBy, dedupResult.parentReviewId);

  await sendNotifications(ctx, result.reviewId, result.findings, result.aiOverview, password, username, result.tokenUsage);
  await notifyReviewComplete(repo.id, result.reviewId, repo.name, result.findings, createdBy);

  return { ...result, pr };
}

async function notifyReviewComplete(
  repoId: string,
  reviewId: string,
  repoName: string,
  findings: RawFinding[],
  createdBy?: string
) {
  const mustFix = findings.filter((f) => f.risk_level === "must_fix").length;
  const total = findings.length;
  const title = mustFix > 0
    ? `Review completed: ${mustFix} must-fix finding${mustFix > 1 ? "s" : ""} in ${repoName}`
    : `Review completed for ${repoName} — ${total} finding${total !== 1 ? "s" : ""}`;
  const message = `Found ${total} finding${total !== 1 ? "s" : ""} (${mustFix} must-fix, ${findings.filter((f) => f.risk_level === "should_fix_soon").length} should-fix)${createdBy ? ` by ${createdBy}` : ""}`;

  try {
    const users = await all<{ id: string }>("SELECT id FROM users");
    for (const user of users) {
      await createNotification(user.id, "review_completed", title, message, "review", reviewId);
    }
  } catch (err) {
    logger.warn(`Failed to create review notifications`, { error: String(err) });
  }
}

export async function rerunReview(reviewId: string, createdBy?: string) {
  const review = await get<{ id: string; repository_id: string; commit_hash: string; review_mode: string }>(
    "SELECT id, repository_id, commit_hash, review_mode FROM reviews WHERE id = $1", [reviewId]
  );
  if (!review) throw new Error("Review not found");

  if (review.review_mode === "pr") {
    const prId = review.commit_hash.replace("pr:", "");
    return runPrReview(review.repository_id, prId, true, createdBy);
  }
  return runManualReview(review.repository_id, review.commit_hash, true, createdBy);
}
