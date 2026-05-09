import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { Review } from "../types";

export const fetchReviews = createAsyncThunk(
  "reviews/fetchAll",
  async (params?: { repository_id?: string; status?: string; review_mode?: string; created_by?: string }) => {
    const query = new URLSearchParams();
    if (params?.repository_id) query.set("repository_id", params.repository_id);
    if (params?.status) query.set("status", params.status);
    if (params?.review_mode) query.set("review_mode", params.review_mode);
    if (params?.created_by) query.set("created_by", params.created_by);
    return api.get<Review[]>(`/api/reviews?${query.toString()}`);
  }
);

const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    items: [] as Review[],
    pagination: { limit: 20, offset: 0 },
    filters: {} as Record<string, string>,
    loading: false,
    error: null as string | null,
  },
  reducers: {
    setFilters(state, action) {
      state.filters = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviews.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReviews.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.error = null;
      })
      .addCase(fetchReviews.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to fetch reviews";
      });
  },
});

export const { setFilters } = reviewsSlice.actions;
export default reviewsSlice.reducer;
