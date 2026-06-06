import { Router, type NextFunction, type Request, type Response } from "express";
import { getAllProviders, createProvider, updateProvider, deleteProvider, getDecryptedApiKey, getProviderById } from "../services/provider-service.js";
import { createAdapter } from "../services/llm/index.js";
import { logger } from "../middleware/index.js";
import { NotFoundError } from "../errors.js";

export const providersRouter = Router();

providersRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await getAllProviders();
    res.json(providers);
  } catch (err) {
    next(err);
  }
});

providersRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { name, api_base, api_key, provider_type, aws_region } = req.body;

  if (!name || !api_key) {
    res.status(400).json({ error: "name and api_key are required" });
    return;
  }

  try {
    const provider = await createProvider(name, api_base || "https://api.openai.com/v1", api_key, provider_type, aws_region);
    res.status(201).json(provider);
  } catch (err) {
    next(err);
  }
});

providersRouter.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  const { name, api_base, api_key, provider_type, aws_region } = req.body;

  try {
    await updateProvider(String(req.params.id), name, api_base, api_key, provider_type, aws_region);
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
});

providersRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteProvider(String(req.params.id));
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

providersRouter.post("/:id/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = await getProviderById(String(req.params.id));
    if (!provider) throw new NotFoundError("Provider not found");

    const apiKey = await getDecryptedApiKey(String(req.params.id));
    const adapter = createAdapter({
      providerType: provider.provider_type || "openai_compatible",
      apiBase: provider.api_base,
      apiKey,
      awsRegion: provider.aws_region || undefined,
    });

    await adapter.testConnection();
    res.json({ success: true, message: "Connection successful" });
  } catch (err) {
    if (err instanceof NotFoundError) { next(err); return; }
    const message = err instanceof Error ? err.message : "Connection failed";
    res.status(502).json({ success: false, error: message });
  }
});

providersRouter.get("/:id/models", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = await getProviderById(String(req.params.id));
    if (!provider) throw new NotFoundError("Provider not found");

    const apiKey = await getDecryptedApiKey(String(req.params.id));
    const adapter = createAdapter({
      providerType: provider.provider_type || "openai_compatible",
      apiBase: provider.api_base,
      apiKey,
      awsRegion: provider.aws_region || undefined,
    });

    const models = await adapter.listModels();

    logger.info("Fetched models from provider", { provider: provider.name, count: models.length });
    res.json({ models });
  } catch (err) {
    if (err instanceof NotFoundError) { next(err); return; }
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn("Failed to fetch models", { error: message });
    res.status(502).json({ error: message });
  }
});
