import { get, run, all } from "../db/queries.js";

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

export async function createReview(review: Omit<ReviewRow, "created_at" | "ai_overview">): Promise<string> {
  await run(
    `INSERT INTO reviews (id, repository_id, commit_hash, branch, status, strictness, review_mode, error_message, completed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [review.id, review.repository_id, review.commit_hash, review.branch, review.status, review.strictness, review.review_mode, review.error_message, review.completed_at, review.created_by]
  );
  return review.id;
}

export async function updateReviewStatus(id: string, status: string, errorMessage?: string, aiOverview?: string): Promise<void> {
  const completedAt = status === "completed" || status === "failed" ? new Date().toISOString() : null;
  await run(
    "UPDATE reviews SET status = $1, error_message = $2, completed_at = COALESCE($3, completed_at), ai_overview = COALESCE($4, ai_overview) WHERE id = $5",
    [status, errorMessage || null, completedAt, aiOverview || null, id]
  );
}

export async function insertFindings(reviewId: string, findings: Omit<FindingRow, "id" | "review_id">[]): Promise<void> {
  const { v4: uuid } = await import("uuid");
  for (const f of findings) {
    await run(
      `INSERT INTO findings (id, review_id, file_path, line_number, summary, explanation, risk_level, suggested_fix, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [uuid(), reviewId, f.file_path, f.line_number, f.summary, f.explanation, f.risk_level, f.suggested_fix, f.category]
    );
  }
}

export async function deleteReview(reviewId: string): Promise<void> {
  await run("DELETE FROM findings WHERE review_id = $1", [reviewId]);
  await run("DELETE FROM reviews WHERE id = $1", [reviewId]);
}
