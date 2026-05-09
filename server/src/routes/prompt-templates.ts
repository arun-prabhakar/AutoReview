import { Router } from "express";
import { v4 as uuid } from "uuid";
import type { SqlValue } from "sql.js";
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
  const templates = await all("SELECT * FROM prompt_templates ORDER BY created_at DESC");
  res.json(templates);
});

promptTemplateRouter.get("/:id", async (req, res) => {
  const template = await get("SELECT * FROM prompt_templates WHERE id = ?", [req.params.id]);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

promptTemplateRouter.post("/", async (req, res) => {
  const id = uuid();
  const { name, content, strictness = "all" } = req.body;

  if (!name || !content) {
    res.status(400).json({ error: "name and content are required" });
    return;
  }

  await run(
    `INSERT INTO prompt_templates (id, name, content, strictness, is_default)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, content, strictness, 0]
  );

  const template = await get("SELECT * FROM prompt_templates WHERE id = ?", [id]);
  res.status(201).json(template);
});

promptTemplateRouter.put("/:id", async (req, res) => {
  const { name, content, strictness } = req.body;
  const existing = await get<{ content: string }>("SELECT content FROM prompt_templates WHERE id = ?", [req.params.id]);

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const fields: string[] = [];
  const values: SqlValue[] = [];

  if (name !== undefined) { fields.push("name = ?"); values.push(name); }
  if (content !== undefined) { fields.push("content = ?"); values.push(content); }
  if (strictness !== undefined) { fields.push("strictness = ?"); values.push(strictness); }

  if (fields.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  fields.push("updated_at = datetime('now')");
  await run(`UPDATE prompt_templates SET ${fields.join(", ")} WHERE id = ?`, [...values, req.params.id]);

  const template = await get("SELECT * FROM prompt_templates WHERE id = ?", [req.params.id]);
  res.json(template);
});

promptTemplateRouter.delete("/:id", async (req, res) => {
  const template = await get("SELECT id, is_default FROM prompt_templates WHERE id = ?", [req.params.id]);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if ((template as { is_default: number }).is_default) {
    res.status(400).json({ error: "Cannot delete the default template" });
    return;
  }
  await run("DELETE FROM prompt_templates WHERE id = ?", [req.params.id]);
  res.status(204).send();
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

    const systemPrompt = `You are an expert prompt engineer specializing in code review AI systems. Your task is to improve a code review prompt template.

Rules:
- Preserve all {{variable}} placeholders exactly as they are ({{diff}}, {{file_paths}}, {{strictness_level}}, {{excluded_paths}}, {{commit_hash}}, {{commit_message}}, {{branch}}, {{repository}})
- The template contains ONLY the instruction section — do NOT add any output format instructions, JSON schema, or field definitions. The output format is fixed and appended automatically by the server.
- Make the prompt more specific, structured, and effective at catching real issues
- Reduce false positives by being explicit about what constitutes a real finding
- Keep the prompt concise but thorough
- Return ONLY the improved instruction text, no explanations or markdown formatting`;

    const userMessage = custom_prompt
      ? `Improve this code review prompt template with these specific instructions:\n\n${custom_prompt}\n\nTemplate to improve:\n\n${content}`
      : `Improve this code review prompt template:\n\n${content}`;

    const response = await client.chat.completions.create({
      model: "gemini-flash-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
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
});
