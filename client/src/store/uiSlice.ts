import { createSlice } from "@reduxjs/toolkit";

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    toasts: [] as { id: string; message: string; type: "success" | "error" | "info" }[],
    modals: {} as Record<string, boolean>,
    sidebarOpen: false,
  },
  reducers: {
    addToast(state, action) {
      state.toasts.push(action.payload);
    },
    removeToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    openModal(state, action) {
      state.modals[action.payload] = true;
    },
    closeModal(state, action) {
      state.modals[action.payload] = false;
    },
  },
});

export const { addToast, removeToast, toggleSidebar, openModal, closeModal } = uiSlice.actions;
export default uiSlice.reducer;
