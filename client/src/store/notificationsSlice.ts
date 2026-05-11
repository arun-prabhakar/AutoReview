import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "../services/api";
import type { Notification } from "../types";

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchAll",
  async () => {
    return api.get<Notification[]>("/api/notifications");
  }
);

export const fetchUnreadCount = createAsyncThunk(
  "notifications/fetchUnreadCount",
  async () => {
    const data = await api.get<{ count: number }>("/api/notifications/unread-count");
    return data.count;
  }
);

export const markNotificationRead = createAsyncThunk(
  "notifications/markRead",
  async (id: string) => {
    await api.patch(`/api/notifications/${id}/read`);
    return id;
  }
);

export const markAllRead = createAsyncThunk(
  "notifications/markAllRead",
  async () => {
    await api.post("/api/notifications/mark-all-read", {});
  }
);

interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
}

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: {
    items: [] as Notification[],
    unreadCount: 0,
    loading: false,
  } as NotificationsState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchNotifications.rejected, (state) => {
        state.loading = false;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const notif = state.items.find((n) => n.id === action.payload);
        if (notif) notif.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      })
      .addCase(markAllRead.fulfilled, (state) => {
        state.items.forEach((n) => { n.read = true; });
        state.unreadCount = 0;
      });
  },
});

export default notificationsSlice.reducer;
