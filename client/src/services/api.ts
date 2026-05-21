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

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
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
    const response = await fetchWithTimeout(path, { credentials: "include" }, options?.timeoutMs);
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }, options?.timeoutMs);
    return handleResponse<T>(response);
  },

  async put<T = unknown>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }, options?.timeoutMs);
    return handleResponse<T>(response);
  },

  async patch<T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    }, options?.timeoutMs);
    return handleResponse<T>(response);
  },

  async del<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "DELETE",
      credentials: "include",
    }, options?.timeoutMs);
    return handleResponse<T>(response);
  },

  reviewTimeoutMs: REVIEW_TIMEOUT_MS,
};
