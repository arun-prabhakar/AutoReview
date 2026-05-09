import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { Review, Finding } from "../types";

export const fetchReviewDetail = createAsyncThunk(
  "reviewDetail/fetch",
  async (id: string) => {
    return api.get<Review>(`/api/reviews/${id}`);
  }
);

interface ReviewDetailState {
  review: Review | null;
  findings: Finding[];
  loading: boolean;
  error: string | null;
}

const reviewDetailSlice = createSlice({
  name: "reviewDetail",
  initialState: {
    review: null,
    findings: [],
    loading: false,
    error: null as string | null,
  } as ReviewDetailState,
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
        state.error = null;
      })
      .addCase(fetchReviewDetail.fulfilled, (state, action) => {
        state.loading = false;
        state.review = action.payload;
        state.findings = action.payload.findings || [];
        state.error = null;
      })
      .addCase(fetchReviewDetail.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to fetch review detail";
      });
  },
});

export const { clearReviewDetail } = reviewDetailSlice.actions;
export default reviewDetailSlice.reducer;
