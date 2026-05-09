const TOKEN_KEY = "autoreview_token";

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("autoreview_user");
  onUnauthorized?.();
  window.location.href = "/login";
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearAuth();
    throw new Error("Session expired");
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
    const token = getToken();
    const response = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const token = getToken();
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
  },

  async del<T = unknown>(path: string): Promise<T> {
    const token = getToken();
    const response = await fetch(path, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return handleResponse<T>(response);
  },
};
