import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { Repository } from "../types";

export const fetchRepositories = createAsyncThunk("repositories/fetchAll", async () => {
  return api.get<Repository[]>("/api/repositories");
});

const repositoriesSlice = createSlice({
  name: "repositories",
  initialState: {
    items: [] as Repository[],
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
