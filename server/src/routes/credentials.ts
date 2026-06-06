import { Router } from "express";
import { getAllCredentials, createCredential, deleteCredential } from "../services/credential-service.js";

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

credentialsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteCredential(req.params.id);
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Credential not found" });
  }
});
