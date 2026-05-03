import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearError } from "../store/authSlice";
import type { RootState, AppDispatch } from "../store";
import { Input } from "@/components/ui/input";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export default function Login() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state: RootState) => state.auth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await dispatch(loginUser({ username, password }));
    if (loginUser.fulfilled.match(result)) {
      navigate("/");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <BlurFade delay={0.1} duration={0.5} inView className="w-full max-w-sm">
        <div className="rounded-lg border bg-card p-8 shadow-sm relative overflow-hidden">
          <div className="text-center space-y-1">
            <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-10 w-10" />
            <h1 className="text-2xl font-bold tracking-tight">Auto<span className="text-indigo-400">Review</span></h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) dispatch(clearError());
                }}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) dispatch(clearError());
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <ShimmerButton
              type="submit"
              disabled={loading}
              shimmerColor="rgba(129, 140, 248, 0.3)"
              background="hsl(var(--primary))"
              className="w-full h-10 rounded-lg font-semibold"
            >
              {loading ? "Signing in..." : "Sign in"}
            </ShimmerButton>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Default: admin / admin
          </p>
        </div>
      </BlurFade>
    </div>
  );
}
