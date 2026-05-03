import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export const fetchPromptTemplate = createAsyncThunk(
  "promptTemplate/fetch",
  async () => {
    const response = await api.get("/api/settings/prompt-template");
    return response.json();
  }
);

export const updatePromptTemplate = createAsyncThunk(
  "promptTemplate/update",
  async (data: { id: string; content: string; strictness: string }) => {
    const response = await api.put(`/api/settings/prompt-template/${data.id}`, {
      content: data.content,
      strictness: data.strictness,
    });
    return response.json();
  }
);

const promptTemplateSlice = createSlice({
  name: "promptTemplate",
  initialState: {
    current: null as Record<string, unknown> | null,
    versions: [] as Record<string, unknown>[],
    strictnessOverrides: {} as Record<string, string>,
    preview: "",
    loading: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPromptTemplate.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPromptTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.current = action.payload;
      })
      .addCase(fetchPromptTemplate.rejected, (state) => {
        state.loading = false;
      })
      .addCase(updatePromptTemplate.fulfilled, (state, action) => {
        state.current = action.payload;
      });
  },
});

export default promptTemplateSlice.reducer;
