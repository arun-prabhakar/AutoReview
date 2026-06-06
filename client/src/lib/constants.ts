export const FAILURE_LABELS: Record<string, string> = {
  llm_context_exceeded: "LLM Context Exceeded",
  llm_response_invalid: "Invalid LLM Response",
  llm_rate_limited: "LLM Rate Limited",
  llm_auth_failed: "LLM Auth Failed",
  llm_unavailable: "LLM Unavailable",
  vcs_rate_limited: "VCS Rate Limited",
  vcs_auth_failed: "VCS Auth Failed",
  vcs_not_found: "Commit / PR Not Found",
  no_provider: "No LLM Provider Configured",
  no_credential: "No Credential Configured",
  internal_error: "Internal Error",
};
