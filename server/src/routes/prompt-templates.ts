import { Router } from "express";
import { v4 as uuid } from "uuid";
import OpenAI from "openai";
import { all, get, run } from "../db/queries.js";
import { getDecryptedApiKey } from "../services/provider-service.js";
import { FIXED_OUTPUT_FORMAT } from "../services/review-engine.js";
import { logger } from "../middleware/index.js";

export const promptTemplateRouter = Router();

promptTemplateRouter.get("/fixed-output-format", (_req, res) => {
  res.json({ content: FIXED_OUTPUT_FORMAT });
});

promptTemplateRouter.get("/", async (_req, res) => {
  try {
    const templates = await all("SELECT * FROM prompt_templates ORDER BY created_at DESC");
    res.json(templates);
  } catch (err) {
    logger.error("Failed to list prompt templates", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to list templates" });
  }
});

promptTemplateRouter.get("/:id", async (req, res) => {
  try {
    const template = await get("SELECT * FROM prompt_templates WHERE id = $1", [req.params.id]);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json(template);
  } catch (err) {
    logger.error("Failed to fetch prompt template", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

promptTemplateRouter.post("/", async (req, res) => {
  try {
    const id = uuid();
    const { name, content, strictness = "all" } = req.body;

    if (!name || !content) {
      res.status(400).json({ error: "name and content are required" });
      return;
    }

    await run(
      `INSERT INTO prompt_templates (id, name, content, strictness, is_default)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, content, strictness, false]
    );

    const template = await get("SELECT * FROM prompt_templates WHERE id = $1", [id]);
    res.status(201).json(template);
  } catch (err) {
    logger.error("Failed to create prompt template", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to create template" });
  }
});

promptTemplateRouter.put("/:id", async (req, res) => {
  try {
    const { name, content, strictness } = req.body;
    const existing = await get<{ content: string }>("SELECT content FROM prompt_templates WHERE id = $1", [req.params.id]);

    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
    if (content !== undefined) { fields.push(`content = $${paramIdx++}`); values.push(content); }
    if (strictness !== undefined) { fields.push(`strictness = $${paramIdx++}`); values.push(strictness); }

    if (fields.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    fields.push("updated_at = NOW()");
    await run(`UPDATE prompt_templates SET ${fields.join(", ")} WHERE id = $${paramIdx}`, [...values, req.params.id]);

    const template = await get("SELECT * FROM prompt_templates WHERE id = $1", [req.params.id]);
    res.json(template);
  } catch (err) {
    logger.error("Failed to update prompt template", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to update template" });
  }
});

promptTemplateRouter.delete("/:id", async (req, res) => {
  try {
    const template = await get("SELECT id, is_default FROM prompt_templates WHERE id = $1", [req.params.id]);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    if ((template as { is_default: boolean }).is_default) {
      res.status(400).json({ error: "Cannot delete the default template" });
      return;
    }
    await run("DELETE FROM prompt_templates WHERE id = $1", [req.params.id]);
    res.status(204).send();
  } catch (err) {
    logger.error("Failed to delete prompt template", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to delete template" });
  }
});

promptTemplateRouter.post("/enhance", async (req, res) => {
  const { content, custom_prompt } = req.body;

  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const provider = await get<{ id: string; name: string; api_base: string; api_key_encrypted: string }>(
      "SELECT id, name, api_base, api_key_encrypted FROM llm_providers WHERE name LIKE '%google%' OR name LIKE '%gemini%' ORDER BY created_at LIMIT 1"
    ) || await get<{ id: string; name: string; api_base: string; api_key_encrypted: string }>(
      "SELECT id, name, api_base, api_key_encrypted FROM llm_providers ORDER BY created_at LIMIT 1"
    );

    if (!provider) {
      res.status(400).json({ error: "No LLM provider configured. Add one in Settings." });
      return;
    }

    const apiKey = await getDecryptedApiKey(provider.id);
    const client = new OpenAI({ apiKey, baseURL: provider.api_base });

    const modelName = req.body.model || "gemini-flash-latest";

    const systemMsg = custom_prompt
      ? `You are an expert code review prompt engineer. Enhance the following prompt template while preserving its intent. Return only the enhanced template.`
      : `You are an expert code review prompt engineer. Enhance the following code review prompt template to be more thorough and specific. Return only the enhanced template.`;

    const userMsg = custom_prompt
      ? `Enhance this prompt template:\n\n${content}\n\nAdditional instructions: ${custom_prompt}`
      : `Enhance this prompt template:\n\n${content}`;

    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const enhanced = response.choices?.[0]?.message?.content || content;
    logger.audit("prompt_enhanced", { provider: provider.name });

    res.json({ content: enhanced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Prompt enhancement failed", { error: message });
    res.status(500).json({ error: message });
  }
});

promptTemplateRouter.post("/test", async (req, res) => {
  try {
    const { content, strictness } = req.body;

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const rendered = content
      .replace(/\{\{repository\}\}/g, "example-repo")
      .replace(/\{\{branch\}\}/g, "main")
      .replace(/\{\{commit_hash\}\}/g, "abc123def456")
      .replace(/\{\{commit_message\}\}/g, "Fix authentication bug")
      .replace(/\{\{strictness_level\}\}/g, strictness || "balanced")
      .replace(/\{\{file_paths\}\}/g, "src/auth.ts\nsrc/middleware.ts")
      .replace(/\{\{excluded_paths\}\}/g, "node_modules/\n*.min.js")
      .replace(/\{\{diff\}\}/g, `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,7 +10,7 @@
-function validateToken(token) {
-  return token.length > 0;
+function validateToken(token: string): boolean {
+  if (!token) return false;
+  return jwt.verify(token, SECRET);
}`);

    res.json({ rendered: rendered + FIXED_OUTPUT_FORMAT });
  } catch (err) {
    logger.error("Failed to test prompt template", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to test template" });
  }
});
