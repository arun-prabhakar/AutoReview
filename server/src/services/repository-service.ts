import { get, all, run } from "../db/queries.js";

export type RepositoryConfig = {
  id: string;
  name: string;
  slug: string;
  workspace: string;
  credential_id: string;
  branch: string;
  review_mode: string;
  auto_review_enabled: boolean;
  poll_interval_minutes: number;
  trigger_on_commit: boolean;
  trigger_on_pr_update: boolean;
  strictness: string;
  generate_email: boolean;
  post_to_bitbucket: boolean;
  excluded_paths: string | null;
  notification_recipients: string | null;
  include_commit_author: boolean;
  llm_provider: string | null;
  llm_provider_id: string | null;
  llm_model: string | null;
  llm_max_tokens: number | null;
  llm_temperature: number | null;
  multi_pass_review: boolean;
  agent_review: boolean;
  policy_fail_on_must_fix?: boolean;
  policy_max_should_fix?: number | null;
  policy_post_build_status?: boolean;
};

export type GlobalLlmSettings = {
  id: string;
  provider_id: string | null;
  model: string | null;
  max_tokens: number | null;
  temperature: number | null;
};

export async function getRepoById(id: string): Promise<RepositoryConfig | undefined> {
  return get<RepositoryConfig>("SELECT * FROM repositories WHERE id = $1", [id]);
}

export async function getAutoReviewRepos(): Promise<RepositoryConfig[]> {
  return all<RepositoryConfig>("SELECT * FROM repositories WHERE auto_review_enabled = true");
}

export async function getGlobalLlmSettings(): Promise<GlobalLlmSettings | undefined> {
  return get<GlobalLlmSettings>("SELECT id, provider_id, model, max_tokens, temperature FROM llm_settings WHERE id = 'global'");
}

export async function upsertGlobalLlmSettings(settings: { provider_id: string; model: string; max_tokens: number; temperature: number }): Promise<void> {
  await run(
    `INSERT INTO llm_settings (id, provider_id, model, max_tokens, temperature)
     VALUES ('global', $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET provider_id = $1, model = $2, max_tokens = $3, temperature = $4, updated_at = NOW()`,
    [settings.provider_id, settings.model, settings.max_tokens, settings.temperature]
  );
}

export type EffectiveRepositoryConfig = Omit<RepositoryConfig, "llm_model" | "llm_max_tokens" | "llm_temperature"> & {
  llm_model: string;
  llm_max_tokens: number;
  llm_temperature: number;
};

export const DEFAULT_LLM_MAX_TOKENS = 4096;
export const DEFAULT_LLM_TEMPERATURE = 0.2;

/**
 * Merges global LLM defaults into a repository config: repository values win when set,
 * otherwise the global defaults apply. Review pipelines receive the effective config,
 * while repository routes keep the raw row so "inherit" stays visible and editable.
 */
export async function getEffectiveRepo(repo: RepositoryConfig | undefined): Promise<EffectiveRepositoryConfig | undefined> {
  if (!repo) return repo;
  const global = await getGlobalLlmSettings();
  if (!global) {
    return {
      ...repo,
      llm_model: repo.llm_model ?? "gpt-4",
      llm_max_tokens: repo.llm_max_tokens ?? DEFAULT_LLM_MAX_TOKENS,
      llm_temperature: repo.llm_temperature ?? DEFAULT_LLM_TEMPERATURE,
    };
  }
  return {
    ...repo,
    llm_provider_id: repo.llm_provider_id ?? global.provider_id,
    llm_model: repo.llm_model ?? global.model ?? "gpt-4",
    llm_max_tokens: repo.llm_max_tokens ?? global.max_tokens ?? DEFAULT_LLM_MAX_TOKENS,
    llm_temperature: repo.llm_temperature ?? global.temperature ?? DEFAULT_LLM_TEMPERATURE,
  };
}
