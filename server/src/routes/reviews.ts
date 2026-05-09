import { Router } from "express";
import { all, get } from "../db/queries.js";
import { runManualReview, runPrReview } from "../services/manual-review-service.js";
import { getRepoById } from "../services/repository-service.js";
import { getDecryptedPassword } from "../services/credential-service.js";
import { fetchOpenPullRequests } from "../services/bitbucket-client.js";
import { requireRole } from "../middleware/jwt-auth.js";
import { deleteReview } from "../services/storage-service.js";

export const reviewsRouter = Router();

reviewsRouter.get("/", async (req, res) => {
  const { repository_id, status, review_mode, created_by, limit = "20", offset = "0" } = req.query;
  const clampedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const clampedOffset = Math.max(Number(offset) || 0, 0);

  let query = `
    SELECT r.*, repo.name as repository_name
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

  const countQuery = query.replace(
    /SELECT r\.\*, repo\.name as repository_name/,
    "SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END), 0) as pending, COALESCE(SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END), 0) as completed, COALESCE(SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END), 0) as failed"
  );
  const counts = await get<{ total: string; pending: string; completed: string; failed: string }>(countQuery, params);
  const total = Number(counts?.total ?? 0);
  const statusCounts = { pending: Number(counts?.pending ?? 0), completed: Number(counts?.completed ?? 0), failed: Number(counts?.failed ?? 0) };

  query += ` ORDER BY r.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(clampedLimit, clampedOffset);

  const reviews = await all(query, params);
  res.json({ reviews, total, statusCounts, limit: Number(limit), offset: Number(offset) });
});

reviewsRouter.get("/:id", async (req, res) => {
  const review = await get<{
    id: string; repository_id: string; commit_hash: string; branch: string | null;
    status: string; strictness: string; review_mode: string; error_message: string | null;
    created_at: string; completed_at: string | null; repository_name: string;
    ai_overview: string | null;
  }>(
    `SELECT r.*, repo.name as repository_name
     FROM reviews r JOIN repositories repo ON r.repository_id = repo.id
     WHERE r.id = $1`,
    [req.params.id]
  );

  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const findings = await all(
    "SELECT * FROM findings WHERE review_id = $1 ORDER BY CASE risk_level WHEN 'must_fix' THEN 0 WHEN 'should_fix_soon' THEN 1 ELSE 2 END",
    [req.params.id]
  );

  res.json({ ...review, findings });
});

reviewsRouter.get("/open-prs/:repositoryId", async (req, res) => {
  try {
    const repo = await getRepoById(req.params.repositoryId);
    if (!repo) { res.status(404).json({ error: "Repository not found" }); return; }

    const credential = await get<{ username: string }>("SELECT username FROM credentials WHERE id = $1", [repo.credential_id]);
    if (!credential) { res.status(400).json({ error: "Credential not found" }); return; }

    const password = await getDecryptedPassword(repo.credential_id);
    const prs = await fetchOpenPullRequests(repo.workspace, repo.slug, password, credential.username);
    res.json(prs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

reviewsRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  const reviewId = String(req.params.id);
  const review = await get<{ id: string }>("SELECT id FROM reviews WHERE id = $1", [reviewId]);
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await deleteReview(reviewId);
  res.status(204).send();
});

reviewsRouter.post("/manual", async (req, res) => {
  const { repository_id, commit_hash, force = false } = req.body;

  if (!repository_id || !commit_hash) {
    res.status(400).json({ error: "repository_id and commit_hash are required" });
    return;
  }

  try {
    const result = await runManualReview(repository_id, commit_hash, Boolean(force), req.user?.username);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

reviewsRouter.post("/pr", async (req, res) => {
  const { repository_id, pr_id, force = false } = req.body;

  if (!repository_id || !pr_id) {
    res.status(400).json({ error: "repository_id and pr_id are required" });
    return;
  }

  try {
    const result = await runPrReview(repository_id, String(pr_id), Boolean(force), req.user?.username);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});
