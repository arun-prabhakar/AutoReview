import { Router } from "express";
import { getAllCredentials, createCredential, updateCredential, deleteCredential } from "../services/credential-service.js";
import { getDecryptedPassword } from "../services/credential-service.js";
import { get } from "../db/queries.js";
import { fetchOpenPullRequests } from "../services/bitbucket-client.js";
import { ValidationError } from "../errors.js";

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

credentialsRouter.post("/:id/test", async (req, res, next) => {
  try {
    const credential = await get<{ username: string }>(
      "SELECT username FROM credentials WHERE id = $1",
      [req.params.id],
    );
    if (!credential) throw new ValidationError("Credential not found");

    const repository = await get<{ name: string; workspace: string; slug: string }>(
      "SELECT name, workspace, slug FROM repositories WHERE credential_id = $1 ORDER BY created_at LIMIT 1",
      [req.params.id],
    );
    if (!repository) {
      throw new ValidationError("Assign this credential to a repository before testing it");
    }

    const password = await getDecryptedPassword(req.params.id);
    const pullRequests = await fetchOpenPullRequests(
      repository.workspace,
      repository.slug,
      password,
      credential.username,
    );
    res.json({ success: true, repository: repository.name, openPullRequests: pullRequests.length });
  } catch (error) {
    if (error instanceof ValidationError) { next(error); return; }
    const message = error instanceof Error ? error.message : "Credential test failed";
    res.status(502).json({ success: false, error: message });
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
