let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void): void {
  onUnauthorized = callback;
}

const TIMEOUT_MS = 30_000;

type ApiRequestOptions = {
  timeoutMs?: number;
};

type StreamEventHandler = (event: string, data: Record<string, unknown>) => void;

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

async function postStream<T>(path: string, body: unknown, onEvent?: StreamEventHandler): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) return handleResponse<T>(response);
  if (!response.body) throw new Error("Review stream is unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      throw new Error(`Review stream disconnected: ${error instanceof Error ? error.message : "network connection lost"}`);
    }
    const { done, value } = chunk;
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) continue;

      const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
      onEvent?.(event, data);
      if (event === "completed") return data as T;
      if (event === "failed") throw new Error(String(data.error || "Review failed"));
    }

    if (done) break;
  }

  throw new Error("Review stream disconnected before completion");
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

  postStream,
};
