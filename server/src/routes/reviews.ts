import { Router, type NextFunction, type Request, type Response } from "express";
import { all, get } from "../db/queries.js";
import { runManualReview, runPrReview, rerunReview } from "../services/manual-review-service.js";
import { getRepoById } from "../services/repository-service.js";
import { getDecryptedPassword } from "../services/credential-service.js";
import { fetchOpenPullRequests } from "../services/bitbucket-client.js";
import { requireRole } from "../middleware/jwt-auth.js";
import { deleteReview, getReviewChain } from "../services/storage-service.js";
import { logger } from "../middleware/index.js";
import { NotFoundError, ValidationError } from "../errors.js";

export const reviewsRouter = Router();

function collectQueryValues(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

reviewsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { repository_id, status, review_mode, created_by, commit_author, limit = "20", offset = "0" } = req.query;
    const clampedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    const selectedAuthors = collectQueryValues(commit_author);

    let query = `
      SELECT r.*, repo.name as repository_name,
        COALESCE((SELECT COUNT(*) FROM findings f WHERE f.review_id = r.id AND f.risk_level = 'must_fix'), 0) as must_fix_count,
        COALESCE((SELECT COUNT(*) FROM findings f WHERE f.review_id = r.id AND f.risk_level = 'should_fix_soon'), 0) as should_fix_count
      FROM reviews r
      JOIN repositories repo ON r.repository_id = repo.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (repository_id) {
      query += ` AND r.repository_id = $${paramIdx++}`;
      params.push(String(repository_id));
    }
    if (status) {
      query += ` AND r.status = $${paramIdx++}`;
      params.push(String(status));
    }
    if (review_mode) {
      query += ` AND r.review_mode = $${paramIdx++}`;
      params.push(String(review_mode));
    }
    if (created_by) {
      query += ` AND r.created_by = $${paramIdx++}`;
      params.push(String(created_by));
    }
    if (selectedAuthors.length > 0) {
      query += ` AND r.commit_author = ANY($${paramIdx++})`;
      params.push(selectedAuthors);
    }

    const countQuery = query.replace(
      /SELECT r\.\*, repo\.name as repository_name[\s\S]*?FROM reviews r/,
      "SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END), 0) as pending, COALESCE(SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END), 0) as completed, COALESCE(SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END), 0) as failed FROM reviews r"
    );
    const counts = await get<{ total: string; pending: string; completed: string; failed: string }>(countQuery, params);
    const total = Number(counts?.total ?? 0);
    const statusCounts = { pending: Number(counts?.pending ?? 0), completed: Number(counts?.completed ?? 0), failed: Number(counts?.failed ?? 0) };

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(clampedLimit, clampedOffset);

    const reviews = await all(query, params);
    res.json({ reviews, total, statusCounts, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    next(err);
  }
});

reviewsRouter.get("/authors", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { repository_id, status, review_mode } = req.query;
    let query = `
      SELECT DISTINCT r.commit_author
      FROM reviews r
      JOIN repositories repo ON r.repository_id = repo.id
      WHERE r.commit_author IS NOT NULL AND r.commit_author <> ''
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (repository_id) {
      query += ` AND r.repository_id = $${paramIdx++}`;
      params.push(String(repository_id));
    }
    if (status) {
      query += ` AND r.status = $${paramIdx++}`;
      params.push(String(status));
    }
    if (review_mode) {
      query += ` AND r.review_mode = $${paramIdx++}`;
      params.push(String(review_mode));
    }

    query += " ORDER BY r.commit_author ASC LIMIT 200";
    const authors = await all<{ commit_author: string }>(query, params);
    res.json(authors.map((row) => row.commit_author));
  } catch (err) {
    next(err);
  }
});

reviewsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = await get<{
      id: string; repository_id: string; commit_hash: string; branch: string | null;
      status: string; strictness: string; review_mode: string; error_message: string | null;
      failure_category: string | null; created_at: string; completed_at: string | null;
      repository_name: string; ai_overview: string | null;
    }>(
      `SELECT r.*, repo.name as repository_name
       FROM reviews r JOIN repositories repo ON r.repository_id = repo.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (!review) throw new NotFoundError("Review not found");

    const findings = await all(
      "SELECT * FROM findings WHERE review_id = $1 ORDER BY CASE risk_level WHEN 'must_fix' THEN 0 WHEN 'should_fix_soon' THEN 1 ELSE 2 END",
      [req.params.id]
    );

    res.json({ ...review, findings });
  } catch (err) {
    next(err);
  }
});

reviewsRouter.get("/open-prs/:repositoryId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = await getRepoById(String(req.params.repositoryId));
    if (!repo) throw new NotFoundError("Repository not found");

    const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = $1", [repo.credential_id]);
    if (!credential) throw new ValidationError("Credential not found for this repository");

    const password = await getDecryptedPassword(repo.credential_id);
    const prs = await fetchOpenPullRequests(repo.workspace, repo.slug, password, credential.username);
    res.json(prs);
  } catch (err) {
    next(err);
  }
});

reviewsRouter.delete("/:id", requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = String(req.params.id);
    const review = await get<{ id: string }>("SELECT id FROM reviews WHERE id = $1", [reviewId]);
    if (!review) throw new NotFoundError("Review not found");
    await deleteReview(reviewId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

reviewsRouter.post("/manual", async (req: Request, res: Response, next: NextFunction) => {
  const { repository_id, commit_hash, force = false } = req.body;

  if (!repository_id || !commit_hash) {
    res.status(400).json({ error: "repository_id and commit_hash are required" });
    return;
  }

  try {
    const result = await runManualReview(repository_id, commit_hash, Boolean(force), req.user?.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

reviewsRouter.post("/pr", async (req: Request, res: Response, next: NextFunction) => {
  const { repository_id, pr_id, force = false } = req.body;

  if (!repository_id || !pr_id) {
    res.status(400).json({ error: "repository_id and pr_id are required" });
    return;
  }

  try {
    const result = await runPrReview(repository_id, String(pr_id), Boolean(force), req.user?.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

reviewsRouter.post("/:id/rereview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rerunReview(String(req.params.id), req.user?.username);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

reviewsRouter.get("/:id/chain", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chain = await getReviewChain(String(req.params.id));
    res.json(chain);
  } catch (err) {
    logger.error("Failed to fetch review chain", { error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
});
