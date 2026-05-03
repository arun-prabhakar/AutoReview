import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import repositoriesReducer from "./repositoriesSlice";
import reviewsReducer from "./reviewsSlice";
import reviewDetailReducer from "./reviewDetailSlice";
import settingsReducer from "./settingsSlice";
import promptTemplateReducer from "./promptTemplateSlice";
import uiReducer from "./uiSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    repositories: repositoriesReducer,
    reviews: reviewsReducer,
    reviewDetail: reviewDetailReducer,
    settings: settingsReducer,
    promptTemplate: promptTemplateReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
