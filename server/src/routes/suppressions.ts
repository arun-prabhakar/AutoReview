import { Router } from "express";
import { getSuppressionRules, createSuppressionRule, deleteSuppressionRule, toggleSuppressionRule } from "../services/storage-service.js";
import { requireRole } from "../middleware/jwt-auth.js";

export const suppressionsRouter = Router();

suppressionsRouter.get("/", async (req, res) => {
  const repoId = req.query.repository_id;
  const rules = await getSuppressionRules(repoId ? String(repoId) : undefined);
  res.json(rules);
});

suppressionsRouter.post("/", requireRole("admin"), async (req, res) => {
  const { repository_id, category, file_pattern, summary_pattern, risk_level, reason } = req.body;

  if (!repository_id || !reason) {
    res.status(400).json({ error: "repository_id and reason are required" });
    return;
  }

  const rule = await createSuppressionRule({
    id: "",
    repository_id,
    category: category || null,
    file_pattern: file_pattern || null,
    summary_pattern: summary_pattern || null,
    risk_level: risk_level || null,
    reason,
    created_by: req.user?.username || "unknown",
    enabled: true,
  });
  res.status(201).json(rule);
});

suppressionsRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  await deleteSuppressionRule(String(req.params.id));
  res.status(204).send();
});

suppressionsRouter.patch("/:id/toggle", requireRole("admin"), async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  await toggleSuppressionRule(String(req.params.id), enabled);
  res.json({ success: true });
});
