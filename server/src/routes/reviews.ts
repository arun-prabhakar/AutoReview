import { Router } from "express";
import type { SqlValue } from "sql.js";
import { all, get } from "../db/queries.js";
import { runManualReview } from "../services/manual-review-service.js";

export const reviewsRouter = Router();

reviewsRouter.get("/", async (req, res) => {
  const { repository_id, status, limit = "20", offset = "0" } = req.query;

  let query = `
    SELECT r.*, repo.name as repository_name
    FROM reviews r
    JOIN repositories repo ON r.repository_id = repo.id
    WHERE 1=1
  `;
  const params: SqlValue[] = [];

  if (repository_id) {
    query += " AND r.repository_id = ?";
    params.push(String(repository_id));
  }
  if (status) {
    query += " AND r.status = ?";
    params.push(String(status));
  }

  query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const reviews = await all(query, params);
  res.json(reviews);
});

reviewsRouter.get("/:id", async (req, res) => {
  const review = await get<{
    id: string; repository_id: string; commit_hash: string; branch: string | null;
    status: string; strictness: string; review_mode: string; error_message: string | null;
    created_at: string; completed_at: string | null; repository_name: string;
  }>(
    `SELECT r.*, repo.name as repository_name
     FROM reviews r JOIN repositories repo ON r.repository_id = repo.id
     WHERE r.id = ?`,
    [req.params.id]
  );

  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const findings = await all(
    "SELECT * FROM findings WHERE review_id = ? ORDER BY risk_level",
    [req.params.id]
  );

  res.json({ ...review, findings });
});

reviewsRouter.post("/manual", async (req, res) => {
  const { repository_id, commit_hash } = req.body;

  if (!repository_id || !commit_hash) {
    res.status(400).json({ error: "repository_id and commit_hash are required" });
    return;
  }

  try {
    const result = await runManualReview(repository_id, commit_hash);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});
