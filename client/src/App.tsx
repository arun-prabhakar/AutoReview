import { useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { Routes, Route, Link } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "./components/layout/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { setOnUnauthorized } from "./services/api";
import { store } from "./store";
import type { AppDispatch } from "./store";
import { validateSession, logoutUser } from "./store/authSlice";
import { Button } from "@/components/ui/button";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const ManualReview = lazy(() => import("./pages/ManualReview"));
const ReviewDetail = lazy(() => import("./pages/ReviewDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));

setOnUnauthorized(() => store.dispatch(logoutUser()));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-muted-foreground text-sm">An unexpected error occurred.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Button asChild variant="outline"><Link to="/">Go to Dashboard</Link></Button>
    </div>
  );
}

export default function App() {
  useDismissLoader();
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(validateSession());
  }, [dispatch]);
  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" /></div>}>
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
            <Route path="*" element={<NotFound />} />
          </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  );
}
