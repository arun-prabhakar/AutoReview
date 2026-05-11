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
    `INSERT INTO reviews (id, repository_id, commit_hash, branch, status, strictness, review_mode, error_message, completed_at, created_by, parent_review_id, tokens_prompt, tokens_completion, tokens_total, estimated_cost, project_context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [review.id, review.repository_id, review.commit_hash, review.branch, review.status, review.strictness, review.review_mode, review.error_message, review.completed_at, review.created_by, review.parent_review_id ?? null, review.tokens_prompt ?? null, review.tokens_completion ?? null, review.tokens_total ?? null, review.estimated_cost ?? null, review.project_context ?? null]
  );
  const created = result.rows.length > 0;
  return { id: created ? result.rows[0].id : review.id, created };
}

export async function updateReviewStatus(
  id: string,
  status: string,
  errorMessage?: string,
  aiOverview?: string,
  tokenData?: { tokens_prompt: number; tokens_completion: number; tokens_total: number; estimated_cost: number }
): Promise<void> {
  const completedAt = status === "completed" || status === "failed" ? new Date().toISOString() : null;
  await run(
    "UPDATE reviews SET status = $1, error_message = $2, completed_at = COALESCE($3, completed_at), ai_overview = COALESCE($4, ai_overview), tokens_prompt = COALESCE($5, tokens_prompt), tokens_completion = COALESCE($6, tokens_completion), tokens_total = COALESCE($7, tokens_total), estimated_cost = COALESCE($8, estimated_cost) WHERE id = $9",
    [status, errorMessage || null, completedAt, aiOverview || null, tokenData?.tokens_prompt ?? null, tokenData?.tokens_completion ?? null, tokenData?.tokens_total ?? null, tokenData?.estimated_cost ?? null, id]
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
    await client.query("DELETE FROM finding_comments WHERE finding_id IN (SELECT id FROM findings WHERE review_id = $1)", [reviewId]);
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

// --- Finding Disposition (Feature 1) ---

export async function updateFindingDisposition(
  findingId: string,
  disposition: string,
  reason: string | null,
  updatedBy: string
): Promise<FindingRow | null> {
  await run(
    "UPDATE findings SET disposition = $1, disposition_reason = $2, disposition_by = $3, disposition_at = $4 WHERE id = $5",
    [disposition, reason, updatedBy, new Date().toISOString(), findingId]
  );
  const result = await get<FindingRow>("SELECT * FROM findings WHERE id = $1", [findingId]);
  return result ?? null;
}

export async function batchUpdateDisposition(
  findingIds: string[],
  disposition: string,
  reason: string | null,
  updatedBy: string
): Promise<void> {
  const now = new Date().toISOString();
  const placeholders = findingIds.map((_, i) => `$${i + 4}`).join(", ");
  await run(
    `UPDATE findings SET disposition = $1, disposition_reason = $2, disposition_by = $3, disposition_at = $5 WHERE id IN (${placeholders})`,
    [disposition, reason, updatedBy, ...findingIds, now]
  );
}

// --- Finding Comments (Feature 9) ---

export type FindingCommentRow = {
  id: string;
  finding_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
};

export async function getFindingComments(findingId: string): Promise<FindingCommentRow[]> {
  return all<FindingCommentRow>("SELECT * FROM finding_comments WHERE finding_id = $1 ORDER BY created_at ASC", [findingId]);
}

export async function addFindingComment(
  findingId: string,
  userId: string,
  username: string,
  content: string
): Promise<FindingCommentRow> {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  await run(
    "INSERT INTO finding_comments (id, finding_id, user_id, username, content) VALUES ($1, $2, $3, $4, $5)",
    [id, findingId, userId, username, content]
  );
  return (await get<FindingCommentRow>("SELECT * FROM finding_comments WHERE id = $1", [id]))!;
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

// --- Suppression Rules (Feature 11) ---

export type SuppressionRuleRow = {
  id: string;
  repository_id: string;
  category: string | null;
  file_pattern: string | null;
  summary_pattern: string | null;
  risk_level: string | null;
  reason: string;
  created_by: string;
  created_at: string;
  enabled: boolean;
};

export async function getSuppressionRules(repositoryId?: string): Promise<SuppressionRuleRow[]> {
  if (repositoryId) {
    return all<SuppressionRuleRow>("SELECT * FROM suppression_rules WHERE repository_id = $1 ORDER BY created_at DESC", [repositoryId]);
  }
  return all<SuppressionRuleRow>("SELECT * FROM suppression_rules ORDER BY created_at DESC");
}

export async function createSuppressionRule(rule: Omit<SuppressionRuleRow, "created_at">): Promise<SuppressionRuleRow> {
  const { v4: uuid } = await import("uuid");
  const id = rule.id || uuid();
  await run(
    "INSERT INTO suppression_rules (id, repository_id, category, file_pattern, summary_pattern, risk_level, reason, created_by, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [id, rule.repository_id, rule.category, rule.file_pattern, rule.summary_pattern, rule.risk_level, rule.reason, rule.created_by, rule.enabled]
  );
  return (await get<SuppressionRuleRow>("SELECT * FROM suppression_rules WHERE id = $1", [id]))!;
}

export async function deleteSuppressionRule(ruleId: string): Promise<void> {
  await run("DELETE FROM suppression_rules WHERE id = $1", [ruleId]);
}

export async function toggleSuppressionRule(ruleId: string, enabled: boolean): Promise<void> {
  await run("UPDATE suppression_rules SET enabled = $1 WHERE id = $2", [enabled, ruleId]);
}

export async function applySuppressionRules(repositoryId: string, findings: RawFindingInput[]): Promise<{ filtered: RawFindingInput[]; suppressed: { finding: RawFindingInput; ruleId: string }[] }> {
  const rules = await all<SuppressionRuleRow>("SELECT * FROM suppression_rules WHERE repository_id = $1 AND enabled = true", [repositoryId]);
  const suppressed: { finding: RawFindingInput; ruleId: string }[] = [];
  const filtered = findings.filter((f) => {
    for (const rule of rules) {
      const matches = (
        (!rule.category || rule.category === f.category) &&
        (!rule.risk_level || rule.risk_level === f.risk_level) &&
        (!rule.file_pattern || new RegExp(rule.file_pattern.replace(/\*/g, ".*").replace(/\?/g, ".")).test(f.file_path)) &&
        (!rule.summary_pattern || new RegExp(rule.summary_pattern, "i").test(f.summary))
      );
      if (matches) {
        suppressed.push({ finding: f, ruleId: rule.id });
        return false;
      }
    }
    return true;
  });
  return { filtered, suppressed };
}

// --- Analytics (Feature 4) ---

export async function getFindingsByCategoryOverTime(days = 30): Promise<{ date: string; category: string; count: string }[]> {
  return all(
    `SELECT DATE(r.created_at) as date, f.category, COUNT(*) as count
     FROM findings f JOIN reviews r ON f.review_id = r.id
     WHERE r.created_at >= NOW() - INTERVAL '1 day' * $1 AND r.status = 'completed'
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

export async function getDispositionStats(): Promise<{ disposition: string; count: string }[]> {
  return all(
    "SELECT disposition, COUNT(*) as count FROM findings GROUP BY disposition ORDER BY count DESC"
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
     WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '1 day' * $1`,
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

// --- Code Health Score (Feature 7) ---

export async function getRepoHealthScore(repositoryId: string): Promise<{ score: number; trend: number; breakdown: { must_fix: number; should_fix: number; open: number; fixed: number; dismissed: number } }> {
  const recent = await get<{
    total: string; must_fix: string; should_fix: string;
    open_count: string; fixed_count: string; dismissed_count: string;
  }>(
    `SELECT
       COUNT(f.id) as total,
       COALESCE(SUM(CASE WHEN f.risk_level = 'must_fix' THEN 1 ELSE 0 END), 0) as must_fix,
       COALESCE(SUM(CASE WHEN f.risk_level = 'should_fix_soon' THEN 1 ELSE 0 END), 0) as should_fix,
       COALESCE(SUM(CASE WHEN f.disposition = 'open' THEN 1 ELSE 0 END), 0) as open_count,
       COALESCE(SUM(CASE WHEN f.disposition = 'fixed' THEN 1 ELSE 0 END), 0) as fixed_count,
       COALESCE(SUM(CASE WHEN f.disposition = 'dismissed' THEN 1 ELSE 0 END), 0) as dismissed_count
     FROM findings f
     JOIN reviews r ON f.review_id = r.id
     WHERE r.repository_id = $1 AND r.status = 'completed' AND r.created_at >= NOW() - INTERVAL '30 days'`,
    [repositoryId]
  );

  const total = Number(recent?.total ?? 0);
  const mustFix = Number(recent?.must_fix ?? 0);
  const shouldFix = Number(recent?.should_fix ?? 0);
  const openCount = Number(recent?.open_count ?? 0);
  const fixedCount = Number(recent?.fixed_count ?? 0);
  const dismissedCount = Number(recent?.dismissed_count ?? 0);

  const fixRate = total > 0 ? (fixedCount + dismissedCount) / total : 1;
  const severityPenalty = (mustFix * 10 + shouldFix * 3) / Math.max(total, 1);
  const score = Math.round(Math.max(0, Math.min(100, 100 - severityPenalty * 50 + fixRate * 20)));

  const prevPeriod = await get<{ total: string; must_fix: string }>(
    `SELECT COUNT(f.id) as total,
       COALESCE(SUM(CASE WHEN f.risk_level = 'must_fix' THEN 1 ELSE 0 END), 0) as must_fix
     FROM findings f JOIN reviews r ON f.review_id = r.id
     WHERE r.repository_id = $1 AND r.status = 'completed'
       AND r.created_at >= NOW() - INTERVAL '60 days' AND r.created_at < NOW() - INTERVAL '30 days'`,
    [repositoryId]
  );
  const prevTotal = Number(prevPeriod?.total ?? 0);
  const prevMustFix = Number(prevPeriod?.must_fix ?? 0);
  const prevScore = prevTotal > 0 ? Math.round(Math.max(0, Math.min(100, 100 - (prevMustFix * 10 / prevTotal) * 50))) : 50;
  const trend = score - prevScore;

  return {
    score,
    trend,
    breakdown: { must_fix: mustFix, should_fix: shouldFix, open: openCount, fixed: fixedCount, dismissed: dismissedCount },
  };
}

export async function getAllRepoHealthScores(): Promise<{ repository_id: string; repository_name: string; score: number; trend: number }[]> {
  return all(
    `SELECT r.repository_id, repo.name as repository_name,
       CASE
         WHEN COUNT(f.id) = 0 THEN 100
         ELSE ROUND(GREATEST(0, LEAST(100,
           100 - (COALESCE(SUM(CASE WHEN f.risk_level = 'must_fix' THEN 10 ELSE 0 END), 0) +
                   COALESCE(SUM(CASE WHEN f.risk_level = 'should_fix_soon' THEN 3 ELSE 0 END), 0)) * 50.0 / COUNT(f.id)
           + COALESCE(SUM(CASE WHEN f.disposition IN ('fixed', 'dismissed') THEN 1 ELSE 0 END), 0) * 20.0 / NULLIF(COUNT(f.id), 0)
         )))
       END as score,
       0 as trend
     FROM reviews r
     JOIN repositories repo ON r.repository_id = repo.id
     LEFT JOIN findings f ON f.review_id = r.id
     WHERE r.status = 'completed' AND r.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY r.repository_id, repo.name
     ORDER BY score ASC`
  );
}

// --- SLA Tracking (Feature 8) ---

export async function getBreachedSlaFindings(): Promise<{ id: string; file_path: string; summary: string; risk_level: string; review_id: string; repository_name: string; created_at: string; hours_open: string }[]> {
  return all(
    `SELECT f.id, f.file_path, f.summary, f.risk_level, f.review_id,
       repo.name as repository_name, r.created_at as created_at,
       EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 as hours_open
     FROM findings f
     JOIN reviews r ON f.review_id = r.id
     JOIN repositories repo ON r.repository_id = repo.id
     WHERE f.disposition = 'open' AND f.risk_level IN ('must_fix', 'should_fix_soon')
       AND (
         (f.risk_level = 'must_fix' AND r.created_at < NOW() - INTERVAL '48 hours')
         OR (f.risk_level = 'should_fix_soon' AND r.created_at < NOW() - INTERVAL '168 hours')
       )
     ORDER BY hours_open DESC`
  );
}

export async function getSlaStats(): Promise<{ risk_level: string; total_open: string; breached: string; avg_hours_open: string }[]> {
  return all(
    `SELECT f.risk_level,
       COUNT(*) as total_open,
       SUM(CASE
         WHEN (f.risk_level = 'must_fix' AND r.created_at < NOW() - INTERVAL '48 hours')
           OR (f.risk_level = 'should_fix_soon' AND r.created_at < NOW() - INTERVAL '168 hours')
         THEN 1 ELSE 0 END) as breached,
       ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)) as avg_hours_open
     FROM findings f
     JOIN reviews r ON f.review_id = r.id
     WHERE f.disposition = 'open' AND f.risk_level IN ('must_fix', 'should_fix_soon')
     GROUP BY f.risk_level`
  );
}
