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
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const USER_KEY = "autoreview_user";

function loadPersistedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

const initialState: AuthState = {
  user: loadPersistedUser(),
  isAuthenticated: false,
  loading: true,
  error: null,
};

export const validateSession = createAsyncThunk(
  "auth/validateSession",
  async () => {
    return await api.get<AuthUser>("/api/auth/me");
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ username, password }: { username: string; password: string }, { rejectWithValue }) => {
    try {
      return await api.post<{ user: AuthUser }>("/api/auth/login", { username, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      return rejectWithValue(message);
    }
  }
);

export const logoutUser = createAsyncThunk(
  "auth/logout",
  async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {}
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
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(validateSession.pending, (state) => {
        state.loading = true;
      })
      .addCase(validateSession.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload));
      })
      .addCase(validateSession.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
        localStorage.removeItem(USER_KEY);
      })
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user));
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.loading = false;
        state.error = null;
        localStorage.removeItem(USER_KEY);
      })
      .addCase(changePassword.fulfilled, (state) => {
        if (state.user) {
          state.user.must_change_password = false;
          localStorage.setItem(USER_KEY, JSON.stringify(state.user));
        }
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
