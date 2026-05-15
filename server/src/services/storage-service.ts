import { get, run, all } from "../db/queries.js";
import { getPool } from "../db/index.js";

export type ReviewRow = {
  id: string;
  repository_id: string;
  commit_hash: string;
  branch: string | null;
  status: string;
  strictness: string;
  review_mode: string;
  error_message: string | null;
  failure_category: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
  ai_overview: string | null;
  parent_review_id: string | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
  estimated_cost: number | null;
  project_context: string | null;
  commit_author: string | null;
};

export type FindingRow = {
  id: string;
  review_id: string;
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: string;
  suggested_fix: string | null;
  category: string | null;
  disposition: string;
  disposition_reason: string | null;
  disposition_by: string | null;
  disposition_at: string | null;
  suppressed: boolean;
  suppressed_by_rule_id: string | null;
};

export async function findExistingReview(repositoryId: string, commitHash: string): Promise<ReviewRow | undefined> {
  return get<ReviewRow>("SELECT * FROM reviews WHERE repository_id = $1 AND commit_hash = $2", [repositoryId, commitHash]);
}

export async function findFindingsByReviewId(reviewId: string): Promise<FindingRow[]> {
  return all<FindingRow>("SELECT * FROM findings WHERE review_id = $1 ORDER BY CASE risk_level WHEN 'must_fix' THEN 0 WHEN 'should_fix_soon' THEN 1 ELSE 2 END", [reviewId]);
}

export async function createReview(review: Omit<ReviewRow, "created_at" | "ai_overview">): Promise<{ id: string; created: boolean }> {
  const result = await getPool().query(
    `INSERT INTO reviews (id, repository_id, commit_hash, branch, status, strictness, review_mode, error_message, completed_at, created_by, parent_review_id, tokens_prompt, tokens_completion, tokens_total, estimated_cost, project_context, commit_author)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [review.id, review.repository_id, review.commit_hash, review.branch, review.status, review.strictness, review.review_mode, review.error_message, review.completed_at, review.created_by, review.parent_review_id ?? null, review.tokens_prompt ?? null, review.tokens_completion ?? null, review.tokens_total ?? null, review.estimated_cost ?? null, review.project_context ?? null, review.commit_author ?? null]
  );
  const created = result.rows.length > 0;
  return { id: created ? result.rows[0].id : review.id, created };
}

export async function updateReviewStatus(
  id: string,
  status: string,
  errorMessage?: string,
  aiOverview?: string,
  tokenData?: { tokens_prompt: number; tokens_completion: number; tokens_total: number; estimated_cost: number },
  failureCategory?: string
): Promise<void> {
  const completedAt = status === "completed" || status === "failed" ? new Date().toISOString() : null;
  await run(
    "UPDATE reviews SET status = $1, error_message = $2, completed_at = COALESCE($3, completed_at), ai_overview = COALESCE($4, ai_overview), tokens_prompt = COALESCE($5, tokens_prompt), tokens_completion = COALESCE($6, tokens_completion), tokens_total = COALESCE($7, tokens_total), estimated_cost = COALESCE($8, estimated_cost), failure_category = COALESCE($9, failure_category) WHERE id = $10",
    [status, errorMessage || null, completedAt, aiOverview || null, tokenData?.tokens_prompt ?? null, tokenData?.tokens_completion ?? null, tokenData?.tokens_total ?? null, tokenData?.estimated_cost ?? null, failureCategory || null, id]
  );
}

export async function insertFindings(reviewId: string, findings: RawFindingInput[]): Promise<void> {
  if (findings.length === 0) return;
  const { v4: uuid } = await import("uuid");
  const cols = 9;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (const f of findings) {
    const id = uuid();
    const offset = values.length;
    placeholders.push(`(${Array.from({ length: cols }, (_, i) => `$${offset + i + 1}`).join(", ")})`);
    values.push(id, reviewId, f.file_path, f.line_number, f.summary, f.explanation, f.risk_level, f.suggested_fix, f.category);
  }
  await getPool().query(
    `INSERT INTO findings (id, review_id, file_path, line_number, summary, explanation, risk_level, suggested_fix, category) VALUES ${placeholders.join(", ")}`,
    values
  );
}

export async function deleteReview(reviewId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM findings WHERE review_id = $1", [reviewId]);
    await client.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// --- Notifications (Feature 8) ---

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string | null,
  entityType?: string,
  entityId?: string
): Promise<NotificationRow> {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  await run(
    "INSERT INTO notifications (id, user_id, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, userId, type, title, message, entityType ?? null, entityId ?? null]
  );
  return (await get<NotificationRow>("SELECT * FROM notifications WHERE id = $1", [id]))!;
}

export async function getNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  return all<NotificationRow>("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2", [userId, limit]);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await get<{ count: string }>("SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false", [userId]);
  return Number(result?.count ?? 0);
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await run("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2", [notificationId, userId]);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await run("UPDATE notifications SET read = true WHERE user_id = $1 AND read = false", [userId]);
}

// --- Analytics (Feature 4) ---

export async function getFindingsByCategoryOverTime(days = 30): Promise<{ date: string; category: string; count: string }[]> {
  return all(
    `SELECT DATE(r.created_at) as date, f.category, COUNT(*) as count
     FROM findings f JOIN reviews r ON f.review_id = r.id
     WHERE r.created_at >= NOW() - ($1 || ' days')::interval AND r.status = 'completed'
     GROUP BY DATE(r.created_at), f.category
     ORDER BY date DESC, count DESC`,
    [days]
  );
}

export async function getTopProblemFiles(limit = 20): Promise<{ file_path: string; count: string; must_fix_count: string }[]> {
  return all(
    `SELECT file_path, COUNT(*) as count,
       SUM(CASE WHEN risk_level = 'must_fix' THEN 1 ELSE 0 END) as must_fix_count
     FROM findings
     GROUP BY file_path
     ORDER BY count DESC LIMIT $1`,
    [limit]
  );
}

export async function getFindingDensityPerRepo(): Promise<{ repository_id: string; repository_name: string; review_count: string; finding_count: string; avg_findings: string }[]> {
  return all(
    `SELECT r.repository_id, repo.name as repository_name,
       COUNT(DISTINCT r.id) as review_count,
       COUNT(f.id) as finding_count,
       ROUND(COUNT(f.id)::numeric / NULLIF(COUNT(DISTINCT r.id), 0), 1) as avg_findings
     FROM reviews r
     JOIN repositories repo ON r.repository_id = repo.id
     LEFT JOIN findings f ON f.review_id = r.id
     WHERE r.status = 'completed'
     GROUP BY r.repository_id, repo.name
     ORDER BY avg_findings DESC`
  );
}

export async function getCostSummary(days = 30): Promise<{ total_reviews: string; total_tokens: string; total_cost: string; by_model: string }[]> {
  return all(
    `SELECT
       COUNT(*) as total_reviews,
       COALESCE(SUM(tokens_total), 0) as total_tokens,
       COALESCE(SUM(estimated_cost), 0) as total_cost,
       COALESCE(SUM(estimated_cost), 0) as by_model
     FROM reviews
     WHERE status = 'completed' AND created_at >= NOW() - ($1 || ' days')::interval`,
    [days]
  );
}

export async function getReviewChain(reviewId: string): Promise<{ id: string; status: string; created_at: string; must_fix_count: string; total_findings: string }[]> {
  const review = await get<{ repository_id: string; commit_hash: string; parent_review_id: string | null }>(
    "SELECT repository_id, commit_hash, parent_review_id FROM reviews WHERE id = $1", [reviewId]
  );
  if (!review) return [];
  return all(
    `SELECT r.id, r.status, r.created_at,
       SUM(CASE WHEN f.risk_level = 'must_fix' THEN 1 ELSE 0 END) as must_fix_count,
       COUNT(f.id) as total_findings
     FROM reviews r
     LEFT JOIN findings f ON f.review_id = r.id
     WHERE r.repository_id = $1 AND r.commit_hash = $2
     GROUP BY r.id, r.status, r.created_at
     ORDER BY r.created_at ASC`,
    [review.repository_id, review.commit_hash]
  );
}

export type RawFindingInput = {
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: string;
  suggested_fix: string | null;
  category: string | null;
};

// --- Cross-Review Finding Deduplication (Feature 6) ---

export async function findSimilarOpenFindings(
  repositoryId: string,
  filePath: string,
  category: string | null,
  summary: string
): Promise<FindingRow[]> {
  const normalizedSummary = summary.substring(0, 80).toLowerCase();
  return all<FindingRow>(
    `SELECT f.* FROM findings f
     JOIN reviews r ON f.review_id = r.id
     WHERE r.repository_id = $1 AND f.file_path = $2 AND f.disposition = 'open'
     AND (f.category = $3 OR ($3 IS NULL AND f.category IS NULL))
     AND LOWER(SUBSTRING(f.summary, 1, 80)) = $4`,
    [repositoryId, filePath, category, normalizedSummary]
  );
}

export async function linkFindings(findingIds: string[], persistentIssueId: string): Promise<void> {
  if (findingIds.length === 0) return;
  const placeholders = findingIds.map((_, i) => `$${i + 2}`).join(", ");
  await run(
    `UPDATE findings SET persistent_issue_id = $1 WHERE id IN (${placeholders})`,
    [persistentIssueId, ...findingIds]
  );
}
