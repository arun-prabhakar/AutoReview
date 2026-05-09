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
};

export async function findExistingReview(repositoryId: string, commitHash: string): Promise<ReviewRow | undefined> {
  return get<ReviewRow>("SELECT * FROM reviews WHERE repository_id = $1 AND commit_hash = $2", [repositoryId, commitHash]);
}

export async function findFindingsByReviewId(reviewId: string): Promise<FindingRow[]> {
  return all<FindingRow>("SELECT * FROM findings WHERE review_id = $1 ORDER BY CASE risk_level WHEN 'must_fix' THEN 0 WHEN 'should_fix_soon' THEN 1 ELSE 2 END", [reviewId]);
}

export async function createReview(review: Omit<ReviewRow, "created_at" | "ai_overview">): Promise<{ id: string; created: boolean }> {
  const result = await getPool().query(
    `INSERT INTO reviews (id, repository_id, commit_hash, branch, status, strictness, review_mode, error_message, completed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (repository_id, commit_hash) DO NOTHING
     RETURNING id`,
    [review.id, review.repository_id, review.commit_hash, review.branch, review.status, review.strictness, review.review_mode, review.error_message, review.completed_at, review.created_by]
  );
  const created = result.rows.length > 0;
  return { id: created ? result.rows[0].id : review.id, created };
}

export async function updateReviewStatus(id: string, status: string, errorMessage?: string, aiOverview?: string): Promise<void> {
  const completedAt = status === "completed" || status === "failed" ? new Date().toISOString() : null;
  await run(
    "UPDATE reviews SET status = $1, error_message = $2, completed_at = COALESCE($3, completed_at), ai_overview = COALESCE($4, ai_overview) WHERE id = $5",
    [status, errorMessage || null, completedAt, aiOverview || null, id]
  );
}

export async function insertFindings(reviewId: string, findings: Omit<FindingRow, "id" | "review_id">[]): Promise<void> {
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
