import { Router } from "express";
import { get, all, run } from "../db/queries.js";
import { v4 as uuid } from "uuid";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { logger } from "../middleware/index.js";

export const shareRouter = Router();

interface ShareTokenRow {
  [key: string]: unknown;
  id: string;
  review_id: string;
  token: string;
  enabled: boolean;
  expires_at: string;
  created_at: string;
  created_by: string;
}

interface ReviewRow {
  [key: string]: unknown;
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
  ai_overview: string | null;
  repository_name: string;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
  estimated_cost: number | null;
  project_context: string | null;
  created_by: string | null;
}

interface FindingRow {
  [key: string]: unknown;
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
  persistent_issue_id: string | null;
}

shareRouter.post("/", jwtAuth, async (req, res) => {
  try {
    const { review_id, expires_in_days } = req.body as { review_id?: string; expires_in_days?: number };

    if (!review_id) {
      res.status(400).json({ error: "review_id is required" });
      return;
    }

    const days = expires_in_days && expires_in_days > 0 ? Math.min(expires_in_days, 90) : 7;

    const review = await get<ReviewRow>(
      `SELECT r.*, repo.name as repository_name
       FROM reviews r JOIN repositories repo ON r.repository_id = repo.id
       WHERE r.id = $1`,
      [review_id]
    );

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const existing = await get<ShareTokenRow>(
      `SELECT * FROM share_tokens
       WHERE review_id = $1 AND enabled = true AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [review_id]
    );

    if (existing) {
      res.json({
        id: existing.id,
        token: existing.token,
        enabled: existing.enabled,
        expires_at: existing.expires_at,
        url: `${process.env.BASE_URL || ""}/shared/${existing.token}`,
      });
      return;
    }

    const id = uuid();
    const token = uuid();
    const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    await run(
      `INSERT INTO share_tokens (id, review_id, token, enabled, expires_at, created_by)
       VALUES ($1, $2, $3, true, $4, $5)`,
      [id, review_id, token, expires_at, req.user!.username]
    );

    res.status(201).json({
      id,
      token,
      enabled: true,
      expires_at,
      url: `${process.env.BASE_URL || ""}/shared/${token}`,
    });
  } catch (err) {
    logger.error("Failed to create share token", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to create share link" });
  }
});

/** GET /:token — Public, no auth */
shareRouter.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const shareToken = await get<ShareTokenRow>(
      `SELECT * FROM share_tokens WHERE token = $1`,
      [token]
    );

    if (!shareToken || !shareToken.enabled) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }

    if (new Date(shareToken.expires_at) <= new Date()) {
      res.status(410).json({ error: "Share link has expired" });
      return;
    }

    const review = await get<ReviewRow>(
      `SELECT r.*, repo.name as repository_name
       FROM reviews r JOIN repositories repo ON r.repository_id = repo.id
       WHERE r.id = $1`,
      [shareToken.review_id]
    );

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const findings = await all<FindingRow>(
      `SELECT * FROM findings WHERE review_id = $1
       ORDER BY CASE risk_level WHEN 'must_fix' THEN 0 WHEN 'should_fix_soon' THEN 1 ELSE 2 END`,
      [shareToken.review_id]
    );

    const {
      repository_id: _ri,
      tokens_prompt: _tp,
      tokens_completion: _tc,
      tokens_total: _tt,
      estimated_cost: _ec,
      project_context: _pc,
      created_by: _cb,
      ...sanitizedReview
    } = review;

    const sanitizedFindings = findings.map((f) => {
      const {
        disposition_by: _db,
        disposition_at: _da,
        disposition_reason: _dr,
        suppressed_by_rule_id: _sr,
        persistent_issue_id: _pi,
        ...rest
      } = f;
      return rest;
    });

    res.json({
      ...sanitizedReview,
      findings: sanitizedFindings,
      shared_at: shareToken.created_at,
      expires_at: shareToken.expires_at,
    });
  } catch (err) {
    logger.error("Failed to fetch shared review", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to load shared review" });
  }
});

/** DELETE /:token — Auth required */
shareRouter.delete("/:token", jwtAuth, async (req, res) => {
  try {
    const { token } = req.params;

    const shareToken = await get<ShareTokenRow>(
      `SELECT * FROM share_tokens WHERE token = $1`,
      [token]
    );

    if (!shareToken) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }

    if (shareToken.created_by !== req.user!.username && req.user!.role !== "admin") {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    await run(
      `UPDATE share_tokens SET enabled = false WHERE token = $1`,
      [token]
    );

    res.status(204).send();
  } catch (err) {
    logger.error("Failed to revoke share token", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to revoke share link" });
  }
});
