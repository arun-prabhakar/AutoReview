import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "./components/layout/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { setOnUnauthorized } from "./services/api";
import { store } from "./store";
import { logout } from "./store/authSlice";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ReviewDetail from "./pages/ReviewDetail";
import ManualReview from "./pages/ManualReview";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

setOnUnauthorized(() => store.dispatch(logout()));

function useDismissLoader() {
  useEffect(() => {
    const el = document.getElementById("app-loader");
    if (!el) return;
    // Wait one extra frame so the page content has painted before we fade out
    const raf = requestAnimationFrame(() => {
      el.dataset.hiding = "true";
      const timer = setTimeout(() => el.remove(), 500);
      return () => clearTimeout(timer);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
}

export default function App() {
  useDismissLoader();
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/reviews/manual" element={<ManualReview />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />
          <Route
            path="/users"
            element={
              <RequireAuth roles={["admin"]}>
                <Users />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth roles={["admin"]}>
                <Settings />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
