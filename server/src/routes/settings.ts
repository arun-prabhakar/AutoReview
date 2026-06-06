import { Router } from "express";
import { all, run } from "../db/queries.js";
import { encrypt } from "../services/encryption-service.js";
import { getDecryptedApiKey, getProviderById } from "../services/provider-service.js";
import { createAdapter } from "../services/llm/index.js";
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
  try {
    const encryptedPassword = smtp_password ? encrypt(smtp_password) : null;
    await run(
      `UPDATE repositories SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_password_encrypted = $4, smtp_from_address = $5, updated_at = NOW() WHERE id = $6`,
      [smtp_host, smtp_port, smtp_user, encryptedPassword, smtp_from_address, req.params.repo_id]
    );
    res.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

settingsRouter.put("/llm/:repo_id", async (req, res) => {
  const { llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature } = req.body;
  try {
    await run(
      `UPDATE repositories SET llm_provider = $1, llm_provider_id = $2, llm_model = $3, llm_max_tokens = $4, llm_temperature = $5, updated_at = NOW() WHERE id = $6`,
      [llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature, req.params.repo_id]
    );
    res.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

settingsRouter.post("/llm/test", async (req, res) => {
  const { provider_id, model } = req.body;
  if (!provider_id) {
    res.status(400).json({ error: "provider_id is required" });
    return;
  }

  try {
    const apiKey = await getDecryptedApiKey(provider_id);
    const provider = await getProviderById(provider_id);
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const adapter = createAdapter({
      providerType: provider.provider_type,
      apiBase: provider.api_base,
      apiKey,
      awsRegion: provider.aws_region || undefined,
    });

    const modelName = model || "gpt-4";

    const start = Date.now();
    const result = await adapter.complete({
      model: modelName,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      maxTokens: 10,
      temperature: 0,
    });
    const latencyMs = Date.now() - start;

    const reply = result.content.trim();
    logger.info("LLM test success", { provider: provider.name, model: modelName, latencyMs });

    res.json({ success: true, reply, model: modelName, latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("LLM test failed", { error: message });
    res.json({ success: false, error: message });
  }
});
