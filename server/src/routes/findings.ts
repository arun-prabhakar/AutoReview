import { Router } from "express";
import { updateFindingDisposition, batchUpdateDisposition, getFindingComments, addFindingComment } from "../services/storage-service.js";
import { get } from "../db/queries.js";

export const findingsRouter = Router();

findingsRouter.patch("/:id/disposition", async (req, res) => {
  const { disposition, reason } = req.body;
  const validDispositions = ["open", "acknowledged", "dismissed", "fixed"];

  if (!disposition || !validDispositions.includes(disposition)) {
    res.status(400).json({ error: `disposition must be one of: ${validDispositions.join(", ")}` });
    return;
  }

  const existing = await get<{ id: string }>("SELECT id FROM findings WHERE id = $1", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  const updated = await updateFindingDisposition(req.params.id, disposition, reason || null, req.user?.username || "unknown");
  res.json(updated);
});

findingsRouter.patch("/batch-disposition", async (req, res) => {
  const { finding_ids, disposition, reason } = req.body;
  const validDispositions = ["open", "acknowledged", "dismissed", "fixed"];

  if (!Array.isArray(finding_ids) || finding_ids.length === 0) {
    res.status(400).json({ error: "finding_ids must be a non-empty array" });
    return;
  }
  if (!disposition || !validDispositions.includes(disposition)) {
    res.status(400).json({ error: `disposition must be one of: ${validDispositions.join(", ")}` });
    return;
  }

  await batchUpdateDisposition(finding_ids, disposition, reason || null, req.user?.username || "unknown");
  res.json({ updated: finding_ids.length });
});

findingsRouter.get("/:id/comments", async (req, res) => {
  const comments = await getFindingComments(req.params.id);
  res.json(comments);
});

findingsRouter.post("/:id/comments", async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const existing = await get<{ id: string }>("SELECT id FROM findings WHERE id = $1", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }

  const comment = await addFindingComment(
    req.params.id,
    req.user?.id || "unknown",
    req.user?.username || "unknown",
    content.trim()
  );
  res.status(201).json(comment);
});
