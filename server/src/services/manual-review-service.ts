import { findExistingReview, findFindingsByReviewId, createReview, updateReviewStatus, insertFindings, deleteReview } from "./storage-service.js";
import { fetchCommitDiff, findPullRequestForCommit, postPrComment } from "./bitbucket-client.js";
import { getRepoById, type RepositoryConfig } from "./repository-service.js";
import { getDecryptedPassword } from "./credential-service.js";
import { getDecryptedApiKey, getProviderById } from "./provider-service.js";
import { analyzeDiff } from "./review-engine.js";
import { generateEmailDraft, sendReviewEmail } from "./email-draft-service.js";
import { get } from "../db/queries.js";
import { v4 as uuid } from "uuid";
import { logger } from "../middleware/index.js";

export async function runManualReview(repositoryId: string, commitHash: string) {
  const existing = await findExistingReview(repositoryId, commitHash);
  if (existing) {
    if (existing.status === "completed") {
      const findings = await findFindingsByReviewId(existing.id);
      return { review: existing, findings, cached: true };
    }
    if (existing.status === "pending") {
      return { review: existing, findings: [], cached: false, message: "Review already in progress" };
    }
    if (existing.status === "failed") {
      await deleteReview(existing.id);
    }
  }

  const repo = await getRepoById(repositoryId);
  if (!repo) throw new Error(`Repository ${repositoryId} not found`);

  return executeReview(repo, commitHash, "manual");
}

async function executeReview(repo: RepositoryConfig, commitHash: string, mode: string) {
  const reviewId = uuid();

  await createReview({
    id: reviewId,
    repository_id: repo.id,
    commit_hash: commitHash,
    branch: repo.branch,
    status: "pending",
    strictness: repo.strictness,
    review_mode: mode,
    error_message: null,
    completed_at: null,
  });

  try {
    const password = await getDecryptedPassword(repo.credential_id);
    const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = ?", [repo.credential_id]);
    if (!credential) throw new Error("Credential not found");

    const { diff, commit, truncated } = await fetchCommitDiff(
      repo.workspace, repo.slug, commitHash, password, credential.username
    );

    const template = await getPromptTemplate(repo.strictness);
    const provider = await resolveProvider(repo);
    const { findings, incomplete } = await analyzeDiff(diff, commit, repo, template, provider, truncated);

    await insertFindings(reviewId, findings);

    if (incomplete) {
      await updateReviewStatus(reviewId, "completed", "Review incomplete: diff was truncated due to size");
    } else {
      await updateReviewStatus(reviewId, "completed");
    }

    await sendNotifications(repo, commitHash, commit.hash, findings, password, credential.username);

    return { reviewId, findings, cached: false, incomplete };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateReviewStatus(reviewId, "failed", message);

    if (message.includes("CREDENTIAL_EXPIRED")) {
      logger.error(`ALERT: Credential expired for repo ${repo.name}`, { repoId: repo.id });
    }

    throw error;
  }
}

async function sendNotifications(
  repo: RepositoryConfig,
  commitHash: string,
  fullHash: string,
  findings: import("./review-engine.js").RawFinding[],
  appPassword: string,
  username: string
) {
  const emailTasks: Promise<void>[] = [];
  const prTasks: Promise<void>[] = [];

  if (repo.generate_email) {
    const emailBody = generateEmailDraft(repo.name, repo.branch, fullHash, findings);
    emailTasks.push(
      sendReviewEmail(repo.id, repo.name, repo.branch, fullHash, findings).catch((err) => {
        logger.error(`Failed to send email for review`, { commitHash: fullHash, error: err.message });
      })
    );
  }

  if (repo.post_to_bitbucket) {
    prTasks.push(
      (async () => {
        try {
          const prId = await findPullRequestForCommit(repo.workspace, repo.slug, commitHash, appPassword, username);
          if (prId) {
            const summary = formatPrComment(findings);
            await postPrComment(repo.workspace, repo.slug, prId, summary, appPassword, username);
          }
        } catch (err) {
          logger.error(`Failed to post PR comment`, { commitHash: fullHash, error: err instanceof Error ? err.message : String(err) });
        }
      })()
    );
  }

  await Promise.all([...emailTasks, ...prTasks]);
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
