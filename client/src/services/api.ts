let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
}

const TIMEOUT_MS = 30_000;

function fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(path, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
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
  async get<T = unknown>(path: string): Promise<T> {
    const response = await fetchWithTimeout(path, { credentials: "include" });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async del<T = unknown>(path: string): Promise<T> {
    const response = await fetchWithTimeout(path, {
      method: "DELETE",
      credentials: "include",
    });
    return handleResponse<T>(response);
  },
};
