import { get, all } from "../db/queries.js";

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
  llm_provider: string;
  llm_provider_id: string | null;
  llm_model: string;
  llm_max_tokens: number;
  llm_temperature: number;
};

export async function getRepoById(id: string): Promise<RepositoryConfig | undefined> {
  return get<RepositoryConfig>("SELECT * FROM repositories WHERE id = $1", [id]);
}

export async function getAutoReviewRepos(): Promise<RepositoryConfig[]> {
  return all<RepositoryConfig>("SELECT * FROM repositories WHERE auto_review_enabled = true");
}
