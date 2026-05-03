const TOKEN_KEY = "autoreview_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export const api = {
  async get(path: string): Promise<Response> {
    const token = getToken();
    return fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async post(path: string, body: unknown): Promise<Response> {
    const token = getToken();
    return fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  },

  async put(path: string, body: unknown): Promise<Response> {
    const token = getToken();
    return fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  },

  async del(path: string): Promise<Response> {
    const token = getToken();
    return fetch(path, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};
