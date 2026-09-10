import { Router } from "express";
import { all, run, get } from "../db/queries.js";
import { encrypt } from "../services/encryption-service.js";
import { getDecryptedApiKey, getProviderById, parseCustomHeaders } from "../services/provider-service.js";
import { upsertGlobalLlmSettings } from "../services/repository-service.js";
import { createAdapter } from "../services/llm/index.js";
import { logger } from "../middleware/index.js";
import { CONNECTION_TEST_PROMPT } from "../prompts/index.js";

export const settingsRouter = Router();

settingsRouter.get("/llm", async (_req, res) => {
  const repos = await all(
    "SELECT id, name, llm_provider, llm_provider_id, llm_model, llm_max_tokens, llm_temperature FROM repositories"
  );
  res.json(repos);
});

settingsRouter.get("/llm-global", async (_req, res) => {
  const row = await get("SELECT id, provider_id, model, max_tokens, temperature FROM llm_settings WHERE id = 'global'");
  res.json(row || { id: "global", provider_id: null, model: null, max_tokens: null, temperature: null });
});

settingsRouter.put("/llm-global", async (req, res) => {
  const { provider_id, model, max_tokens, temperature } = req.body;
  if (!provider_id || !model) {
    res.status(400).json({ error: "provider_id and model are required" });
    return;
  }
  try {
    await upsertGlobalLlmSettings({
      provider_id: String(provider_id),
      model: String(model),
      max_tokens: Number(max_tokens) || 4096,
      temperature: Number(temperature) || 0.2,
    });
    res.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

settingsRouter.get("/smtp", async (_req, res) => {
  const row = await get("SELECT id, smtp_host, smtp_port, smtp_user, smtp_from_address, enabled FROM smtp_settings WHERE id = 'global'");
  res.json(row || { id: "global", smtp_host: null, smtp_port: null, smtp_user: null, smtp_from_address: null, enabled: true });
});

settingsRouter.put("/smtp", async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_address, enabled } = req.body;
  try {
    const existing = await get<{ smtp_host: string | null; smtp_port: number | null; smtp_user: string | null; smtp_password_encrypted: string | null; smtp_from_address: string | null; enabled: boolean }>(
      "SELECT smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address, enabled FROM smtp_settings WHERE id = 'global'"
    );
    const host = smtp_host !== undefined ? smtp_host : existing?.smtp_host ?? null;
    const port = smtp_port !== undefined ? smtp_port : existing?.smtp_port ?? null;
    const user = smtp_user !== undefined ? smtp_user : existing?.smtp_user ?? null;
    const fromAddress = smtp_from_address !== undefined ? smtp_from_address : existing?.smtp_from_address ?? null;
    const isEnabled = enabled !== undefined ? Boolean(enabled) : existing?.enabled ?? true;
    const encryptedPassword = smtp_password === undefined
      ? existing?.smtp_password_encrypted ?? null
      : smtp_password
        ? encrypt(smtp_password)
        : null;
    await run(
      `INSERT INTO smtp_settings (id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_from_address, enabled, created_at, updated_at)
       VALUES ('global', $1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_password_encrypted = $4, smtp_from_address = $5, enabled = $6, updated_at = NOW()`,
      [host, port, user, encryptedPassword, fromAddress, isEnabled]
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
      [
        llm_provider || null,
        llm_provider_id || null,
        llm_model || null,
        llm_max_tokens === "" || llm_max_tokens == null ? null : Number(llm_max_tokens),
        llm_temperature === "" || llm_temperature == null ? null : Number(llm_temperature),
        req.params.repo_id,
      ]
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
      providerType: provider.provider_type || "openai_compatible",
      apiBase: provider.api_base,
      apiKey,
      awsRegion: provider.aws_region || undefined,
      customHeaders: parseCustomHeaders(provider.custom_headers),
    });
    const modelName = model || "gpt-4";

    const start = Date.now();
    const result = await adapter.complete({
      model: modelName,
      messages: [{ role: "user", content: CONNECTION_TEST_PROMPT }],
      maxTokens: 10,
      temperature: 0,
    });
    const latencyMs = Date.now() - start;

    const reply = result.content || "";
    logger.info("LLM test success", { provider: provider.name, model: modelName, latencyMs });

    res.json({ success: true, reply, model: modelName, latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("LLM test failed", { error: message });
    res.json({ success: false, error: message });
  }
});
