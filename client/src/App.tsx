import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "./components/layout/Layout";
import { RequireAuth } from "./components/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ReviewDetail from "./pages/ReviewDetail";
import ManualReview from "./pages/ManualReview";
import Settings from "./pages/Settings";

export default function App() {
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
