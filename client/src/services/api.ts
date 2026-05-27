let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
}

const TIMEOUT_MS = 30_000;
const REVIEW_TIMEOUT_MS = 180_000;

type ApiRequestOptions = {
  timeoutMs?: number;
};

function fetchWithTimeout(path: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(path, { ...init, signal: controller.signal })
    .catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Request timed out. The review may still be running; refresh the dashboard in a moment.");
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function handleResponse<T>(response: Response, init?: RequestInit): Promise<T> {
  if (response.status === 401) {
    // Attempt silent refresh once before forcing logout
    if (init?.method !== "POST" || !response.url.endsWith("/api/auth/refresh")) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        const retryInit = { ...init, headers: undefined, body: init?.body };
        const retryRes = await fetch(response.url, { ...retryInit, credentials: "include" });
        if (retryRes.ok) {
          if (retryRes.status === 204) return undefined as T;
          return retryRes.json();
        }
      }
    }
    localStorage.removeItem("autoreview_user");
    onUnauthorized?.();
    throw new Error("Session expired");
  }
  if (response.status === 429) {
    const data = await response.json().catch(() => ({ error: "Too many requests. Please try again later." }));
    throw new Error(data.error || "Too many requests. Please try again later.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  async get<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T> {
    const init: RequestInit = { credentials: "include" };
    const response = await fetchWithTimeout(path, init, options?.timeoutMs);
    return handleResponse<T>(response, init);
  },

  async post<T = unknown>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    };
    const response = await fetchWithTimeout(path, init, options?.timeoutMs);
    return handleResponse<T>(response, init);
  },

  async put<T = unknown>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    const init: RequestInit = {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    };
    const response = await fetchWithTimeout(path, init, options?.timeoutMs);
    return handleResponse<T>(response, init);
  },

  async patch<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    const init: RequestInit = {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    };
    const response = await fetchWithTimeout(path, init, options?.timeoutMs);
    return handleResponse<T>(response, init);
  },

  async del<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T> {
    const init: RequestInit = {
      method: "DELETE",
      credentials: "include",
    };
    const response = await fetchWithTimeout(path, init, options?.timeoutMs);
    return handleResponse<T>(response, init);
  },

  reviewTimeoutMs: REVIEW_TIMEOUT_MS,
};
