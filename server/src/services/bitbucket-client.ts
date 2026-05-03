import { logger } from "../middleware/index.js";

const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function retryFetch(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 401 || response.status === 403) {
        throw new Error(`CREDENTIAL_EXPIRED: Bitbucket auth failed (${response.status}). Credentials may be expired or invalid.`);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? Number(retryAfter) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`Bitbucket rate limited`, { delay, attempt, retries });
        await sleep(delay);
        continue;
      }

      if (response.status >= 500 && attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`Bitbucket server error`, { status: response.status, delay, attempt, retries });
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CREDENTIAL_EXPIRED")) {
        throw error;
      }
      if (attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`Bitbucket request failed`, { delay, attempt, retries, error: String(error) });
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Bitbucket API failed after ${retries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeAuthHeader(appPassword: string, username: string): Record<string, string> {
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return { Authorization: `Basic ${auth}` };
}

export async function fetchCommitDiff(
  workspace: string,
  repoSlug: string,
  commitHash: string,
  appPassword: string,
  username: string
): Promise<{ diff: string; commit: CommitInfo; truncated: boolean }> {
  const headers = makeAuthHeader(appPassword, username);

  const [commitRes, diffRes] = await Promise.all([
    retryFetch(`${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/commit/${commitHash}`, { headers }),
    retryFetch(`${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/diff/${commitHash}`, { headers }),
  ]);

  if (!commitRes.ok) throw new Error(`Bitbucket commit API error: ${commitRes.status}`);
  if (!diffRes.ok) throw new Error(`Bitbucket diff API error: ${diffRes.status}`);

  const commit = (await commitRes.json()) as CommitInfo;
  let diff = await diffRes.text();
  let truncated = false;

  const MAX_DIFF_SIZE = 100_000;
  if (diff.length > MAX_DIFF_SIZE) {
    diff = diff.substring(0, MAX_DIFF_SIZE);
    truncated = true;
    logger.warn(`Diff truncated`, { commitHash, maxSize: MAX_DIFF_SIZE });
  }

  return { diff, commit, truncated };
}

export async function fetchRecentCommits(
  workspace: string,
  repoSlug: string,
  branch: string,
  appPassword: string,
  username: string
): Promise<CommitInfo[]> {
  const headers = makeAuthHeader(appPassword, username);

  const url = `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/commits/${branch}?pagelen=10`;
  const res = await retryFetch(url, { headers });
  if (!res.ok) throw new Error(`Bitbucket commits API error: ${res.status}`);

  const data = await res.json();
  return data.values || [];
}

export async function postPrComment(
  workspace: string,
  repoSlug: string,
  pullRequestId: string,
  comment: string,
  appPassword: string,
  username: string
): Promise<void> {
  const headers = { ...makeAuthHeader(appPassword, username), "Content-Type": "application/json" };

  const res = await retryFetch(
    `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/comments`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content: { raw: comment } }),
    }
  );

  if (!res.ok) {
    logger.error(`Failed to post PR comment`, { status: res.status });
  }
}

export async function findPullRequestForCommit(
  workspace: string,
  repoSlug: string,
  commitHash: string,
  appPassword: string,
  username: string
): Promise<string | null> {
  const headers = makeAuthHeader(appPassword, username);

  const res = await retryFetch(
    `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests?q=source.commit.hash="${commitHash}"&fields=values.id`,
    { headers }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data.values?.[0]?.id?.toString() || null;
}

export async function fetchOpenPullRequests(
  workspace: string,
  repoSlug: string,
  appPassword: string,
  username: string
): Promise<PullRequestInfo[]> {
  const headers = makeAuthHeader(appPassword, username);

  const res = await retryFetch(
    `${BITBUCKET_API_BASE}/repositories/${workspace}/${repoSlug}/pullrequests?state=OPEN&fields=values.id,values.title,values.source.commit.hash,values.updated_on`,
    { headers }
  );

  if (!res.ok) {
    logger.error(`Failed to fetch PRs`, { workspace, repoSlug, status: res.status });
    return [];
  }

  const data = await res.json();
  return (data.values || []).map((pr: Record<string, unknown>) => ({
    id: String(pr.id),
    title: String(pr.title || ""),
    commitHash: (pr.source as Record<string, Record<string, string>>)?.commit?.hash || "",
    updatedOn: String(pr.updated_on || ""),
  }));
}

export type PullRequestInfo = {
  id: string;
  title: string;
  commitHash: string;
  updatedOn: string;
};

export type CommitInfo = {
  hash: string;
  message: string;
  date: string;
  author: { raw: string };
};
