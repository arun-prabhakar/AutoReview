import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export const fetchRepositories = createAsyncThunk("repositories/fetchAll", async () => {
  const response = await api.get("/api/repositories");
  return response.json();
});

const repositoriesSlice = createSlice({
  name: "repositories",
  initialState: {
    items: [] as Record<string, unknown>[],
    loading: false,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRepositories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRepositories.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchRepositories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch repositories";
      });
  },
});

export default repositoriesSlice.reducer;
