import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { LlmSettings, SmtpSettings } from "../types";

export const fetchSettings = createAsyncThunk("settings/fetch", async () => {
  const [llm, smtp] = await Promise.all([
    api.get<LlmSettings[]>("/api/settings/llm"),
    api.get<SmtpSettings>("/api/settings/smtp"),
  ]);
  return { llm, smtp };
});

const settingsSlice = createSlice({
  name: "settings",
  initialState: {
    credentials: [] as Record<string, unknown>[],
    smtp: null as SmtpSettings | null,
    llmConfig: [] as LlmSettings[],
    loading: false,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.llmConfig = action.payload.llm;
        state.smtp = action.payload.smtp;
        state.error = null;
      })
      .addCase(fetchSettings.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to fetch settings";
      });
  },
});

export default settingsSlice.reducer;
