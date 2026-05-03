import { Router } from "express";
import { getAllProviders, createProvider, updateProvider, deleteProvider } from "../services/provider-service.js";
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
