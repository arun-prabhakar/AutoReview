import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { Review } from "../types";

interface PaginatedReviewsResponse {
  reviews: Review[];
  total: number;
  statusCounts: { pending: number; completed: number; failed: number };
  limit: number;
  offset: number;
}

interface FetchReviewsParams {
  repository_id?: string;
  status?: string;
  review_mode?: string;
  created_by?: string;
  commit_author?: string[];
  limit?: number;
  offset?: number;
}

export const fetchReviews = createAsyncThunk(
  "reviews/fetchAll",
  async (params?: FetchReviewsParams) => {
    const query = new URLSearchParams();
    if (params?.repository_id) query.set("repository_id", params.repository_id);
    if (params?.status) query.set("status", params.status);
    if (params?.review_mode) query.set("review_mode", params.review_mode);
    if (params?.created_by) query.set("created_by", params.created_by);
    params?.commit_author?.forEach((author) => query.append("commit_author", author));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    return api.get<PaginatedReviewsResponse>(`/api/reviews?${query.toString()}`);
  }
);

const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    items: [] as Review[],
    total: 0,
    statusCounts: { pending: 0, completed: 0, failed: 0 },
    pagination: { limit: 20, offset: 0 },
    filters: {} as Record<string, string>,
    loading: false,
    initialLoad: true,
    error: null as string | null,
  },
  reducers: {
    setFilters(state, action) {
      state.filters = action.payload;
    },
    setPage(state, action) {
      state.pagination.offset = action.payload * state.pagination.limit;
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
        state.initialLoad = false;
        state.items = action.payload.reviews;
        state.total = action.payload.total;
        state.statusCounts = action.payload.statusCounts;
        state.pagination.limit = action.payload.limit;
        state.pagination.offset = action.payload.offset;
        state.error = null;
      })
      .addCase(fetchReviews.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to fetch reviews";
      });
  },
});

export const { setFilters, setPage } = reviewsSlice.actions;
export default reviewsSlice.reducer;
