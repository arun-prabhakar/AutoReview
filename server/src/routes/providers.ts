import { Router } from "express";
import OpenAI from "openai";
import { getAllProviders, createProvider, updateProvider, deleteProvider, getDecryptedApiKey } from "../services/provider-service.js";
import { get } from "../db/queries.js";
import { logger } from "../middleware/index.js";

export const providersRouter = Router();

providersRouter.get("/", async (_req, res) => {
  const providers = await getAllProviders();
  res.json(providers);
});

providersRouter.post("/", async (req, res) => {
  const { name, api_base, api_key } = req.body;

  if (!name || !api_base || !api_key) {
    res.status(400).json({ error: "name, api_base, and api_key are required" });
    return;
  }

  try {
    const provider = await createProvider(name, api_base, api_key);
    res.status(201).json(provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("UNIQUE")) {
      res.status(409).json({ error: "Provider name already exists" });
      return;
    }
    res.status(500).json({ error: message });
  }
});

providersRouter.put("/:id", async (req, res) => {
  const { name, api_base, api_key } = req.body;

  try {
    await updateProvider(req.params.id, name, api_base, api_key);
    res.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

providersRouter.delete("/:id", async (req, res) => {
  try {
    await deleteProvider(req.params.id);
    res.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

providersRouter.post("/:id/test", async (req, res) => {
  try {
    const provider = await get<{ api_base: string; name: string }>(
      "SELECT api_base, name FROM llm_providers WHERE id = $1", [req.params.id]
    );
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const apiKey = await getDecryptedApiKey(req.params.id);
    const client = new OpenAI({ apiKey, baseURL: provider.api_base });

    await client.models.list();
    res.json({ success: true, message: "Connection successful" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    res.status(502).json({ success: false, error: message });
  }
});

providersRouter.get("/:id/models", async (req, res) => {
  try {
    const provider = await get<{ api_base: string; name: string }>(
      "SELECT api_base, name FROM llm_providers WHERE id = $1", [req.params.id]
    );
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const apiKey = await getDecryptedApiKey(req.params.id);
    const client = new OpenAI({ apiKey, baseURL: provider.api_base });

    const response = await client.models.list();
    const models = (response.data || [])
      .map((m) => m.id)
      .sort();

    logger.info("Fetched models from provider", { provider: provider.name, count: models.length });
    res.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("Failed to fetch models", { error: message });
    res.status(502).json({ error: message });
  }
});
