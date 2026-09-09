import { getPool } from "../db/index.js";
import { fetchFileFromRepoAtRef } from "./bitbucket-client.js";
import { createAdapter, type ProviderConfig } from "./llm/index.js";
import { logger } from "../middleware/index.js";

const EMBEDDING_DIMS = 1536;
const CHUNK_LINES = 60;
const CHUNK_OVERLAP_LINES = 10;
const MAX_FILES_PER_REVIEW = 10;
const MAX_CHUNKS_PER_REVIEW = 40;
const MAX_FILE_CHARS = 100_000;
const RETRIEVE_TOP_K = 12;
const CHUNK_CONTEXT_CAP = 1500;
const TOTAL_CONTEXT_CAP = 6000;
const MAX_QUERY_CHARS = 2000;

export type CodeChunk = {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
};

export function chunkFileContent(content: string): CodeChunk[] {
  if (content.length > MAX_FILE_CHARS) content = content.slice(0, MAX_FILE_CHARS);
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  const step = CHUNK_LINES - CHUNK_OVERLAP_LINES;
  for (let start = 0; start < lines.length && chunks.length < MAX_CHUNKS_PER_REVIEW; start += step) {
    const slice = lines.slice(start, start + CHUNK_LINES);
    const text = slice.join("\n").trim();
    if (text) {
      chunks.push({ file_path: "", start_line: start + 1, end_line: start + slice.length, content: text });
    }
    if (start + CHUNK_LINES >= lines.length) break;
  }
  return chunks;
}

let ragAvailable: boolean | null = null;

export async function ensureRagSchema(): Promise<boolean> {
  if (ragAvailable !== null) return ragAvailable;
  try {
    await getPool().query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${EMBEDDING_DIMS}) NOT NULL,
        indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks (repository_id)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding ON code_chunks USING hnsw (embedding vector_cosine_ops)`);
    ragAvailable = true;
  } catch (err) {
    logger.warn("RAG unavailable: pgvector schema could not be created", { error: String(err) });
    ragAvailable = false;
  }
  return ragAvailable;
}

function ragEnabled(): boolean {
  return (process.env.RAG_ENABLED ?? "true").toLowerCase() !== "false";
}

function embeddingModel(): string {
  return process.env.EMBEDDING_MODEL || "text-embedding-3-small";
}

function extractChangedPaths(diff: string): string[] {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  return matches.map((m) => m.replace(/^diff --git a\//, "").split(" b/")[0]);
}

export async function indexChangedFiles(params: {
  repositoryId: string;
  workspace: string;
  slug: string;
  commitHash: string;
  diff: string;
  provider: ProviderConfig;
  password: string;
  username: string;
}): Promise<{ files: number; chunks: number }> {
  if (!ragEnabled()) return { files: 0, chunks: 0 };
  if (!(await ensureRagSchema())) return { files: 0, chunks: 0 };

  const adapter = createAdapter(params.provider);
  if (typeof adapter.embed !== "function") return { files: 0, chunks: 0 };

  const paths = extractChangedPaths(params.diff)
    .filter((p) => !p.includes("lock") && !/\.(min\.js|min\.css|png|jpg|jpeg|gif|ico|woff2?|ttf|svg)$/i.test(p))
    .slice(0, MAX_FILES_PER_REVIEW);
  if (paths.length === 0) return { files: 0, chunks: 0 };

  let files = 0;
  let chunks = 0;
  let budget = MAX_CHUNKS_PER_REVIEW;

  for (const filePath of paths) {
    if (budget <= 0) break;
    const content = await fetchFileFromRepoAtRef(params.workspace, params.slug, filePath, params.commitHash, params.password, params.username);
    if (!content) continue;
    const chunksForFile = chunkFileContent(content).map((c) => ({ ...c, file_path: filePath })).slice(0, budget);
    if (chunksForFile.length === 0) continue;

    let vectors: number[][];
    try {
      vectors = await adapter.embed(chunksForFile.map((c) => c.content), embeddingModel());
    } catch (err) {
      logger.warn("RAG embedding call failed; skipping indexing for this review", { error: String(err) });
      return { files, chunks };
    }
    if (vectors.length !== chunksForFile.length || vectors.some((v) => v.length !== EMBEDDING_DIMS)) {
      logger.warn("RAG embedding dimension mismatch; skipping indexing for this review", { expected: EMBEDDING_DIMS });
      return { files, chunks };
    }

    const { v4: uuid } = await import("uuid");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM code_chunks WHERE repository_id = $1 AND file_path = $2", [params.repositoryId, filePath]);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      chunksForFile.forEach((c, i) => {
        const offset = values.length;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::vector, NOW())`);
        values.push(uuid(), params.repositoryId, c.file_path, c.start_line, c.end_line, c.content, JSON.stringify(vectors[i]));
      });
      await client.query(
        `INSERT INTO code_chunks (id, repository_id, file_path, start_line, end_line, content, embedding, indexed_at) VALUES ${placeholders.join(", ")}`,
        values
      );
      await client.query("COMMIT");
      files++;
      chunks += chunksForFile.length;
      budget -= chunksForFile.length;
    } catch (err) {
      await client.query("ROLLBACK");
      logger.warn("RAG index upsert failed", { filePath, error: String(err) });
    } finally {
      client.release();
    }
  }

  return { files, chunks };
}

export async function retrieveCodeContext(params: {
  repositoryId: string;
  diff: string;
  commitMessage: string;
  provider: ProviderConfig;
}): Promise<string | undefined> {
  if (!ragEnabled()) return undefined;
  if (!(await ensureRagSchema())) return undefined;

  const adapter = createAdapter(params.provider);
  if (typeof adapter.embed !== "function") return undefined;

  const changed = new Set(extractChangedPaths(params.diff));
  const query = `${params.commitMessage}\n${params.diff.slice(0, MAX_QUERY_CHARS)}`;

  let queryVector: number[];
  try {
    const [vector] = await adapter.embed([query], embeddingModel());
    if (!vector || vector.length !== EMBEDDING_DIMS) return undefined;
    queryVector = vector;
  } catch (err) {
    logger.warn("RAG query embedding failed; continuing without retrieved context", { error: String(err) });
    return undefined;
  }

  const result = await getPool().query(
    `SELECT file_path, start_line, end_line, content
     FROM code_chunks
     WHERE repository_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT ${RETRIEVE_TOP_K * 2}`,
    [params.repositoryId, JSON.stringify(queryVector)]
  );

  const rows = result.rows as CodeChunk[];
  const selected = rows.filter((r) => !changed.has(r.file_path)).slice(0, RETRIEVE_TOP_K);
  if (selected.length === 0) return undefined;

  const sections: string[] = [];
  let total = 0;
  for (const chunk of selected) {
    const body = chunk.content.length > CHUNK_CONTEXT_CAP ? `${chunk.content.slice(0, CHUNK_CONTEXT_CAP)}...[truncated]` : chunk.content;
    const section = `--- ${chunk.file_path}:${chunk.start_line}-${chunk.end_line} ---\n${body}`;
    if (total + section.length > TOTAL_CONTEXT_CAP) break;
    sections.push(section);
    total += section.length;
  }
  if (sections.length === 0) return undefined;

  logger.info("RAG context retrieved", { repositoryId: params.repositoryId, chunks: sections.length });
  return sections.join("\n\n");
}
