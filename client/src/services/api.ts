let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
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
    const response = await fetch(path, { credentials: "include" });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async del<T = unknown>(path: string): Promise<T> {
    const response = await fetch(path, {
      method: "DELETE",
      credentials: "include",
    });
    return handleResponse<T>(response);
  },
};
