import { Router } from "express";
import { all, run } from "../db/queries.js";
import { encrypt } from "../services/encryption-service.js";

export const settingsRouter = Router();

settingsRouter.get("/llm", async (_req, res) => {
  const repos = await all(
    "SELECT id, name, llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature FROM repositories"
  );
  res.json(repos);
});

settingsRouter.get("/smtp", async (_req, res) => {
  const repos = await all(
    "SELECT id, name, smtp_host, smtp_port, smtp_user, smtp_from_address FROM repositories"
  );
  res.json(repos);
});

settingsRouter.put("/smtp/:repo_id", async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_address } = req.body;
  const encryptedPassword = smtp_password ? encrypt(smtp_password) : null;
  await run(
    `UPDATE repositories SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password_encrypted = ?, smtp_from_address = ?, updated_at = datetime('now') WHERE id = ?`,
    [smtp_host, smtp_port, smtp_user, encryptedPassword, smtp_from_address, req.params.repo_id]
  );
  res.json({ updated: true });
});

settingsRouter.put("/llm/:repo_id", async (req, res) => {
  const { llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature } = req.body;
  await run(
    `UPDATE repositories SET llm_provider = ?, llm_provider_id = ?, llm_model = ?, llm_max_tokens = ?, llm_temperature = ?, updated_at = datetime('now') WHERE id = ?`,
    [llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature, req.params.repo_id]
  );
  res.json({ updated: true });
});
