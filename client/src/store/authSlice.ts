import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
  must_change_password?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const TOKEN_KEY = "autoreview_token";
const USER_KEY = "autoreview_user";

function loadPersisted(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);
    if (token && user) return { token, user: JSON.parse(user) };
  } catch {}
  return { token: null, user: null };
}

const persisted = loadPersisted();

const initialState: AuthState = {
  user: persisted.user,
  token: persisted.token,
  isAuthenticated: !!persisted.token,
  loading: false,
  error: null,
};

export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      return await api.post<{ token: string; user: AuthUser }>("/api/auth/login", { username, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      return rejectWithValue(message);
    }
  }
);

export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async ({ current_password, new_password }: { current_password: string; new_password: string }, { rejectWithValue }) => {
    try {
      return await api.post<{ message: string }>("/api/auth/change-password", { current_password, new_password });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to change password";
      return rejectWithValue(message);
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        localStorage.setItem(TOKEN_KEY, action.payload.token);
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user));
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(changePassword.fulfilled, (state) => {
        if (state.user) {
          state.user.must_change_password = false;
          localStorage.setItem(USER_KEY, JSON.stringify(state.user));
        }
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
