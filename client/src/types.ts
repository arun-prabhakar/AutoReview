export interface Review {
  id: string;
  repository_id: string;
  commit_hash: string;
  branch: string | null;
  status: 'pending' | 'completed' | 'failed';
  strictness: string;
  review_mode: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
  repository_name?: string;
  ai_overview?: string | null;
  findings?: Finding[];
  parent_review_id?: string | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  tokens_total?: number | null;
  estimated_cost?: number | null;
  project_context?: string | null;
  commit_author?: string | null;
}

export interface Finding {
  id: string;
  review_id: string;
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: 'must_fix' | 'should_fix_soon' | 'ignore';
  suggested_fix: string | null;
  category: string | null;
}

export interface Repository {
  id: string;
  name: string;
  slug: string;
  workspace: string;
  credential_id: string;
  branch: string;
  review_mode: string;
  auto_review_enabled: number;
  poll_interval_minutes: number;
  trigger_on_commit: number;
  trigger_on_pr_update: number;
  strictness: string;
  generate_email: number;
  post_to_bitbucket: number;
  excluded_paths: string | null;
  notification_recipients: string | null;
  include_commit_author: number;
  llm_provider: string;
  llm_provider_id: string | null;
  llm_model: string;
  llm_max_tokens: number;
  llm_temperature: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  smtp_from_address: string | null;
  multi_pass_review: number;
}

export interface Credential {
  id: string;
  username: string;
  workspace: string | null;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  name: string;
  api_base: string;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  strictness: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface LlmSettings {
  id: string;
  name: string;
  llm_provider: string;
  llm_provider_id: string | null;
  llm_model: string;
  llm_max_tokens: number;
  llm_temperature: number;
}

export interface SmtpSettings {
  id: string;
  name: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from_address: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface ReviewChainItem {
  id: string;
  status: string;
  created_at: string;
  must_fix_count: string;
  total_findings: string;
}

export interface ShareToken {
  id: string;
  token: string;
  enabled: boolean;
  expires_at: string;
  url: string;
}
