import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";

export const fetchReviews = createAsyncThunk(
  "reviews/fetchAll",
  async (params?: { repository_id?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.repository_id) query.set("repository_id", params.repository_id);
    if (params?.status) query.set("status", params.status);
    const response = await api.get(`/api/reviews?${query.toString()}`);
    return response.json();
  }
);

const reviewsSlice = createSlice({
  name: "reviews",
  initialState: {
    items: [] as Record<string, unknown>[],
    pagination: { limit: 20, offset: 0 },
    filters: {} as Record<string, string>,
    loading: false,
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
      })
      .addCase(fetchReviews.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchReviews.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { setFilters } = reviewsSlice.actions;
export default reviewsSlice.reducer;
