import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export const fetchSettings = createAsyncThunk("settings/fetch", async () => {
  const [llm, smtp] = await Promise.all([
    api.get("/api/settings/llm").then((r) => r.json()),
    api.get("/api/settings/smtp").then((r) => r.json()),
  ]);
  return { llm, smtp };
});

const settingsSlice = createSlice({
  name: "settings",
  initialState: {
    credentials: [] as Record<string, unknown>[],
    smtp: [] as Record<string, unknown>[],
    llmConfig: [] as Record<string, unknown>[],
    loading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.llmConfig = action.payload.llm;
        state.smtp = action.payload.smtp;
      })
      .addCase(fetchSettings.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default settingsSlice.reducer;
