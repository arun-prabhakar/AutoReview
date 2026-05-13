import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearError } from "../store/authSlice";
import type { RootState, AppDispatch } from "../store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface LocationState {
  from?: { pathname: string; search: string; hash: string };
}

export default function Login() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error } = useSelector((state: RootState) => state.auth);
  const from = (location.state as LocationState)?.from;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });

  const usernameError = touched.username && !username.trim() ? "Username is required" : null;
  const passwordError = touched.password && !password.trim() ? "Password is required" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ username: true, password: true });
    if (!username.trim() || !password.trim()) return;
    const result = await dispatch(loginUser({ username, password }));
    if (loginUser.fulfilled.match(result)) {
      navigate(from ? `${from.pathname}${from.search}${from.hash}` : "/", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-lg">
          <div className="text-center space-y-1">
            <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-10 w-10" />
            <h1 className="text-2xl font-bold tracking-tight">Auto<span className="text-foreground">Review</span></h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            {error && (
              <div className="rounded-md bg-secondary px-3 py-2 text-sm text-destructive animate-in fade-in slide-in-from-top-2 duration-300">{error}</div>
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
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                placeholder="admin"
                autoComplete="username"
                aria-invalid={!!usernameError}
              />
              {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) dispatch(clearError());
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-10"
                  aria-invalid={!!passwordError}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full h-10 rounded-lg font-semibold"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {import.meta.env.DEV && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              Default: admin / admin
            </p>
          )}
        </div>
    </div>
  );
}
