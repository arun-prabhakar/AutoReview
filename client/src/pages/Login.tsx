import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, clearError } from "../store/authSlice";
import type { RootState, AppDispatch } from "../store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  fadeIn,
  fadeInUp,
  staggerContainer,
  useReducedMotionVariants,
} from "@/lib/motion";

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

  const containerVariants = useReducedMotionVariants(staggerContainer);
  const itemVariants = useReducedMotionVariants(fadeInUp);
  const footerVariants = useReducedMotionVariants(fadeIn);

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
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black_20%,transparent_100%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground) / 0.04) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="relative z-10 w-full max-w-sm rounded-xl border bg-card p-8 shadow-card"
      >
        <motion.div variants={itemVariants} className="space-y-1 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">AutoReview</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <AnimatePresence>
            {error && (
              <motion.div
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={itemVariants}
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="username">Username</Label>
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
          </motion.div>

          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          </motion.div>

          <motion.div variants={itemVariants}>
            <Button type="submit" loading={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </motion.div>
        </form>

        {import.meta.env.DEV && (
          <motion.div variants={itemVariants} className="mt-4 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Dev credentials — username <span className="font-mono text-foreground">admin</span>,
              password <span className="font-mono text-foreground">admin</span>
            </p>
          </motion.div>
        )}
      </motion.div>

      <motion.p
        initial="hidden"
        animate="visible"
        variants={footerVariants}
        className="relative z-10 text-xs text-muted-foreground"
      >
        AutoReview — AI-powered code reviews
      </motion.p>
    </div>
  );
}
