import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export const fetchReviewDetail = createAsyncThunk(
  "reviewDetail/fetch",
  async (id: string) => {
    const response = await api.get(`/api/reviews/${id}`);
    return response.json();
  }
);

const reviewDetailSlice = createSlice({
  name: "reviewDetail",
  initialState: {
    review: null as Record<string, unknown> | null,
    findings: [] as Record<string, unknown>[],
    loading: false,
  },
  reducers: {
    clearReviewDetail(state) {
      state.review = null;
      state.findings = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviewDetail.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchReviewDetail.fulfilled, (state, action) => {
        state.loading = false;
        state.review = action.payload;
        state.findings = action.payload.findings || [];
      })
      .addCase(fetchReviewDetail.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { clearReviewDetail } = reviewDetailSlice.actions;
export default reviewDetailSlice.reducer;
