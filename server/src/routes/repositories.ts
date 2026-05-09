import { Router } from "express";
import { v4 as uuid } from "uuid";
import type { SqlValue } from "sql.js";
import { all, get, run } from "../db/queries.js";

export const repositoriesRouter = Router();

repositoriesRouter.get("/", async (_req, res) => {
  const repos = await all("SELECT * FROM repositories ORDER BY created_at DESC");
  res.json(repos);
});

repositoriesRouter.get("/:id", async (req, res) => {
  const repo = await get("SELECT * FROM repositories WHERE id = ?", [req.params.id]);
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }
  res.json(repo);
});

repositoriesRouter.post("/", async (req, res) => {
  const id = uuid();
  const {
    name, slug, workspace, credential_id, branch,
    review_mode = "manual", strictness = "balanced",
  } = req.body;

  if (!name || !slug || !workspace || !credential_id) {
    res.status(400).json({ error: "name, slug, workspace, and credential_id are required" });
    return;
  }

  await run(
    `INSERT INTO repositories (id, name, slug, workspace, credential_id, branch, review_mode, strictness)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, slug, workspace, credential_id, branch || "main", review_mode, strictness]
  );

  const repo = await get("SELECT * FROM repositories WHERE id = ?", [id]);
  res.status(201).json(repo);
});

const ALLOWED_UPDATE_FIELDS: readonly string[] = [
  "name", "slug", "workspace", "credential_id", "branch", "review_mode", "auto_review_enabled",
  "poll_interval_minutes", "trigger_on_commit", "trigger_on_pr_update", "strictness",
  "generate_email", "post_to_bitbucket", "excluded_paths", "notification_recipients",
  "include_commit_author", "llm_provider", "llm_provider_id", "llm_model", "llm_max_tokens",
  "llm_temperature", "smtp_host", "smtp_port", "smtp_user", "smtp_from_address",
] as const;

repositoriesRouter.put("/:id", async (req, res) => {
  const filteredEntries = Object.entries(req.body).filter(
    ([key]) => ALLOWED_UPDATE_FIELDS.includes(key),
  );

  if (filteredEntries.length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const fields = filteredEntries.map(([key]) => key);
  const values = filteredEntries.map(([, val]) => val);

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  await run(
    `UPDATE repositories SET ${setClause}, updated_at = datetime('now') WHERE id = ?`,
    [...values as SqlValue[], req.params.id]
  );

  const repo = await get("SELECT * FROM repositories WHERE id = ?", [req.params.id]);
  res.json(repo);
});

repositoriesRouter.delete("/:id", async (req, res) => {
  const repo = await get("SELECT id FROM repositories WHERE id = ?", [req.params.id]);
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }
  await run("DELETE FROM repositories WHERE id = ?", [req.params.id]);
  res.status(204).send();
});
