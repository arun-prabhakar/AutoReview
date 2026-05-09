import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { PromptTemplate } from "../types";

export const fetchPromptTemplate = createAsyncThunk(
  "promptTemplate/fetch",
  async () => {
    return api.get<PromptTemplate>("/api/settings/prompt-template");
  }
);

export const updatePromptTemplate = createAsyncThunk(
  "promptTemplate/update",
  async (data: { id: string; content: string; strictness: string }) => {
    return api.put<PromptTemplate>(`/api/settings/prompt-template/${data.id}`, {
      content: data.content,
      strictness: data.strictness,
    });
  }
);

const promptTemplateSlice = createSlice({
  name: "promptTemplate",
  initialState: {
    current: null as PromptTemplate | null,
    preview: "",
    loading: false,
    error: null as string | null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPromptTemplate.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPromptTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.current = action.payload;
        state.error = null;
      })
      .addCase(fetchPromptTemplate.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to fetch prompt template";
      })
      .addCase(updatePromptTemplate.fulfilled, (state, action) => {
        state.current = action.payload;
      });
  },
});

export default promptTemplateSlice.reducer;
