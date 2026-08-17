import { Router } from "express";
import { getAllCredentials, createCredential, updateCredential, deleteCredential } from "../services/credential-service.js";

export const credentialsRouter = Router();

credentialsRouter.get("/", async (_req, res) => {
  try {
    const creds = await getAllCredentials();
    res.json(creds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

credentialsRouter.post("/", async (req, res) => {
  const { username, app_password, workspace } = req.body;

  if (!username || !app_password) {
    res.status(400).json({ error: "username and app_password are required" });
    return;
  }

  try {
    const result = await createCredential(username, app_password, workspace);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

credentialsRouter.put("/:id", async (req, res, next) => {
  const { username, app_password, workspace } = req.body;

  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  try {
    const result = await updateCredential(req.params.id, username, workspace, app_password || undefined);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

credentialsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteCredential(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
