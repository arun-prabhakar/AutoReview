import { Router } from "express";
import OpenAI from "openai";
import { all, run, get } from "../db/queries.js";
import { encrypt } from "../services/encryption-service.js";
import { getDecryptedApiKey } from "../services/provider-service.js";
import { logger } from "../middleware/index.js";

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

settingsRouter.post("/llm/test", async (req, res) => {
  const { provider_id, model } = req.body;
  if (!provider_id) {
    res.status(400).json({ error: "provider_id is required" });
    return;
  }

  try {
    const apiKey = await getDecryptedApiKey(provider_id);
    const provider = await get<{ api_base: string; name: string }>(
      "SELECT api_base, name FROM llm_providers WHERE id = ?", [provider_id]
    );
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const client = new OpenAI({ apiKey, baseURL: provider.api_base });
    const modelName = model || "gpt-4";

    const start = Date.now();
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 10,
      temperature: 0,
    });
    const latencyMs = Date.now() - start;

    const reply = response.choices?.[0]?.message?.content || "";
    logger.info("LLM test success", { provider: provider.name, model: modelName, latencyMs });

    res.json({ success: true, reply, model: modelName, latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("LLM test failed", { error: message });
    res.json({ success: false, error: message });
  }
});
