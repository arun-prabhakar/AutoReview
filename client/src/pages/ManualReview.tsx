import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { type RootState, type AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, Kbd, PageHeader, SeverityBadge, StatusBadge } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";
import { fadeInUp, useReducedMotionVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPaste,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { Repository } from "@/types";

type ReviewResult = {
  cached?: boolean;
  reviewId?: string;
  review?: Record<string, unknown>;
  findings?: Record<string, unknown>[];
  pr?: { id: string; title: string; sourceBranch: string; destinationBranch: string; author: string };
};

type OpenPr = {
  id: string;
  title: string;
  sourceBranch: string;
  destinationBranch: string;
  author: string;
  updatedOn: string;
};

type ReviewPreflight = {
  model: string;
  changedFiles: number;
  estimatedInputTokens: number;
  estimatedMaxOutputTokens: number;
  estimatedMaxCost: number;
  truncated: boolean;
  incremental: boolean;
  passes: number;
  diffCharacters: number;
  analyzedDiffCharacters: number;
};

type RecentTarget = { repoId: string; repoName: string; hash: string };

type EstimateCache = { key: string; data: ReviewPreflight | null };

const RECENTS_STORAGE_KEY = "autoreview.manual-recents";
const RECENTS_MAX = 3;
const COMMIT_HASH_PATTERN = /^[0-9a-fA-F]{7,40}$/;

function loadRecentTargets(): RecentTarget[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentTarget =>
          Boolean(item) &&
          typeof item.repoId === "string" &&
          typeof item.repoName === "string" &&
          typeof item.hash === "string"
      )
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

function persistRecentTargets(targets: RecentTarget[]): void {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(targets));
  } catch {
    // Storage unavailable (private mode, quota) — recents simply won't persist.
  }
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const STEPS = ["Choose target", "Confirm & run"] as const;

export default function ManualReview() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { items: repos, loading: loadingRepos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const stepVariants = useReducedMotionVariants(fadeInUp);

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"commit" | "pr">("pr");
  const [repoId, setRepoId] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [prId, setPrId] = useState("");
  const [touched, setTouched] = useState({ repo: false, commit: false, pr: false });
  const [recentTargets, setRecentTargets] = useState<RecentTarget[]>(loadRecentTargets);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);
  const [resolvedHash, setResolvedHash] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openPrs, setOpenPrs] = useState<OpenPr[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [prLoadError, setPrLoadError] = useState("");
  const [prsLoaded, setPrsLoaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streamStatus, setStreamStatus] = useState("");
  const [preflight, setPreflight] = useState<ReviewPreflight | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [pendingForce, setPendingForce] = useState(false);
  const [estimate, setEstimate] = useState<EstimateCache | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeReviewRef = useRef<string | null>(null);
  const cancellationRequestedRef = useRef(false);
  const commitInputRef = useRef<HTMLInputElement>(null);

  const selectedRepo = repos.find((repo) => String(repo.id) === repoId) ?? null;
  const selectedPr = openPrs.find((pr) => pr.id === prId) ?? null;
  const trimmedHash = commitHash.trim();
  const hashFormatOk = COMMIT_HASH_PATTERN.test(trimmedHash);

  const repoError = touched.repo && !repoId ? "Select a repository to continue." : "";
  const commitError =
    mode === "commit" && touched.commit && !hashFormatOk
      ? trimmedHash
        ? "Commit hash must be 7-40 hexadecimal characters (0-9, a-f)."
        : "Enter a commit hash to continue."
      : "";
  const prError = mode === "pr" && touched.pr && !prId ? "Select or enter a pull request to continue." : "";
  const step1Valid = Boolean(repoId) && (mode === "commit" ? hashFormatOk : Boolean(prId));

  const estimateKey = `${repoId}:${mode}:${mode === "commit" ? trimmedHash : prId}`;
  const visibleRecents = repos.length > 0 ? recentTargets.filter((t) => repos.some((r) => String(r.id) === t.repoId)) : [];

  useEffect(() => {
    if (submitting) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [submitting]);

  useEffect(() => { dispatch(fetchRepositories()); }, [dispatch]);

  // Lightweight cost estimate shown on the confirm step. Fails silently — the
  // real preflight (run on submit) surfaces any errors.
  useEffect(() => {
    if (step !== 2 || submitting || preflighting || !repoId) return;
    if (!step1Valid) return;
    if (estimate && estimate.key === estimateKey) return;
    let cancelled = false;
    setEstimating(true);
    api.post<ReviewPreflight>("/api/reviews/preflight", {
      repository_id: repoId,
      mode: mode === "commit" ? "manual" : "pr",
      target: mode === "commit" ? commitHash : prId,
    })
      .then((data) => { if (!cancelled) setEstimate({ key: estimateKey, data }); })
      .catch(() => { if (!cancelled) setEstimate({ key: estimateKey, data: null }); })
      .finally(() => { if (!cancelled) setEstimating(false); });
    return () => { cancelled = true; };
  }, [step, submitting, preflighting, repoId, mode, commitHash, prId, estimateKey, step1Valid, estimate]);

  const loadOpenPrs = async (selectedRepoId: string) => {
    if (!selectedRepoId) return;
    setLoadingPrs(true);
    setPrLoadError("");
    setPrsLoaded(false);
    setOpenPrs([]);
    try {
      const data = await api.get<OpenPr[]>(`/api/reviews/open-prs/${selectedRepoId}`);
      setOpenPrs(data);
      setPrsLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load open pull requests";
      setPrLoadError(message);
      toast({ title: "Could not load open PRs", description: message, variant: "destructive" });
    } finally {
      setLoadingPrs(false);
    }
  };

  const handleRepoChange = (id: string) => {
    setRepoId(id);
    setOpenPrs([]);
    setPrId("");
    if (mode === "pr") loadOpenPrs(id);
  };

  const handleModeChange = (newMode: "commit" | "pr") => {
    setMode(newMode);
    setResult(null);
    if (newMode === "pr" && repoId) loadOpenPrs(repoId);
  };

  const markAllTouched = () => setTouched({ repo: true, commit: true, pr: true });

  const focusFirstInvalid = () => {
    if (!repoId) {
      document.getElementById("repo-select")?.focus();
    } else if (mode === "commit" && !hashFormatOk) {
      commitInputRef.current?.focus();
    } else {
      document.getElementById("pr-target")?.focus();
    }
  };

  const goNext = () => {
    markAllTouched();
    if (!step1Valid) {
      focusFirstInvalid();
      return;
    }
    setStep(2);
  };

  const applyRecentTarget = (target: RecentTarget) => {
    setMode("commit");
    setResult(null);
    setRepoId(target.repoId);
    setOpenPrs([]);
    setPrId("");
    setCommitHash(target.hash);
    setTouched({ repo: false, commit: false, pr: false });
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard API unavailable");
      const text = (await navigator.clipboard.readText()).replace(/\s+/g, "");
      if (!text) {
        toast({ title: "Clipboard is empty", description: "Copy a commit hash first." });
        return;
      }
      setCommitHash(text);
      setTouched((t) => ({ ...t, commit: true }));
    } catch {
      toast({ title: "Clipboard unavailable", description: "Paste the hash manually with Ctrl+V." });
    }
  };

  const rememberTarget = (target: RecentTarget) => {
    setRecentTargets((prev) => {
      const next = [target, ...prev.filter((t) => !(t.repoId === target.repoId && t.hash === target.hash))].slice(0, RECENTS_MAX);
      persistRecentTargets(next);
      return next;
    });
  };

  const submitReview = async (force: boolean) => {
    setSubmitting(true);
    setCancelRequested(false);
    setResult(null);
    cancellationRequestedRef.current = false;
    if (mode === "commit" && hashFormatOk && selectedRepo) {
      rememberTarget({ repoId: String(selectedRepo.id), repoName: selectedRepo.name, hash: trimmedHash });
    }
    setStreamStatus("Connecting to review stream...");
    try {
      let data: ReviewResult;
      const handleStreamEvent = (event: string, payload: Record<string, unknown>) => {
        if (event === "started" || event === "heartbeat" || event === "progress") {
          setStreamStatus(String(payload.message || "Review is running..."));
        }
        if (event === "progress" && payload.reviewId) {
          const reviewId = String(payload.reviewId);
          activeReviewRef.current = reviewId;
          setActiveReviewId(reviewId);
        }
      };
      if (mode === "commit") {
        data = await api.postStream<ReviewResult>("/api/reviews/manual/stream", {
          repository_id: repoId,
          commit_hash: commitHash,
          force,
        }, handleStreamEvent);
      } else {
        data = await api.postStream<ReviewResult>("/api/reviews/pr/stream", {
          repository_id: repoId,
          pr_id: prId,
          force,
        }, handleStreamEvent);
      }

      if (data.cached && !force) {
        const reviewId = data.reviewId ?? (data.review as Record<string, string> | undefined)?.id ?? null;
        const storedHash = (data.review as Record<string, string> | undefined)?.commit_hash ?? null;
        setExistingReviewId(reviewId);
        setResolvedHash(storedHash);
        setConfirmOpen(true);
        return;
      }

      setResult(data);
      toast({ title: "Review Completed", description: "Findings are ready." });
    } catch (err) {
      const recoveryId = activeReviewRef.current;
      if (cancellationRequestedRef.current) {
        toast({ title: "Review cancelled", description: "Model generation was stopped.", variant: "default" });
        if (recoveryId) navigate(`/reviews/${recoveryId}`);
      } else if (recoveryId && err instanceof Error && /disconnect|network|fetch|connection|stream/i.test(err.message)) {
        toast({ title: "Connection interrupted", description: "The review is still running. Opening its status page.", variant: "default" });
        navigate(`/reviews/${recoveryId}`);
      } else {
        toast({ title: "Review Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
      setStreamStatus("");
      setActiveReviewId(null);
      activeReviewRef.current = null;
    }
  };

  const cancelActiveReview = useCallback(async () => {
    const reviewId = activeReviewRef.current;
    if (!reviewId) return;
    cancellationRequestedRef.current = true;
    setCancelRequested(true);
    try {
      await api.post(`/api/reviews/${reviewId}/cancel`, {});
      setStreamStatus("Cancellation requested; waiting for the current stage to stop...");
    } catch (err) {
      cancellationRequestedRef.current = false;
      setCancelRequested(false);
      toast({ title: "Cancellation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }, [toast]);

  // Esc cancels the running stream once the server-side review id is known
  // (only safe to cancel when the backend can actually stop generation).
  useEffect(() => {
    if (!submitting || !activeReviewId || cancelRequested) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelActiveReview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitting, activeReviewId, cancelRequested, cancelActiveReview]);

  const prepareReview = async (force: boolean) => {
    const key = estimateKey;
    if (estimate && estimate.key === key && estimate.data) {
      setPreflight(estimate.data);
      setPendingForce(force);
      setPreflightOpen(true);
      return;
    }
    setPreflighting(true);
    try {
      const data = await api.post<ReviewPreflight>("/api/reviews/preflight", {
        repository_id: repoId,
        mode: mode === "commit" ? "manual" : "pr",
        target: mode === "commit" ? commitHash : prId,
      });
      setPreflight(data);
      setEstimate({ key, data });
      setPendingForce(force);
      setPreflightOpen(true);
    } catch (err) {
      toast({ title: "Preflight failed", description: err instanceof Error ? err.message : "Could not inspect the diff", variant: "destructive" });
    } finally {
      setPreflighting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (step === 1) goNext();
    else if (step1Valid) prepareReview(false);
    else setStep(1);
  };

  const handleViewExisting = () => {
    setConfirmOpen(false);
    if (existingReviewId) navigate(`/reviews/${existingReviewId}`);
  };

  const handleReviewAgain = () => {
    setConfirmOpen(false);
    prepareReview(true);
  };

  const conflictLabel = mode === "commit"
    ? commitHash.substring(0, 12)
    : `PR #${prId}`;

  const findings = result?.findings ?? [];
  const mustFixCount = findings.filter((f) => f.risk_level === "must_fix").length;
  const shouldFixCount = findings.filter((f) => f.risk_level === "should_fix_soon").length;
  const ignoreCount = findings.filter((f) => f.risk_level === "ignore").length;
  const worstTone = mustFixCount > 0
    ? "critical"
    : shouldFixCount > 0
      ? "warning"
      : "success";
  const resultBorderClass = {
    critical: "border-destructive/30",
    warning: "border-warning/30",
    success: "border-success/30",
  }[worstTone];

  const coverageRatio = preflight && preflight.diffCharacters > 0
    ? preflight.analyzedDiffCharacters / preflight.diffCharacters
    : 1;

  const noRepos = !loadingRepos && repos.length === 0;

  const renderStepper = (
    <ol className="flex w-full items-center gap-3" aria-label="Review setup progress">
      <li className="flex items-center gap-2">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to step 1: Choose target"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-semibold">{STEPS[0]}</span>
          </button>
        ) : (
          <span className="flex items-center gap-2" aria-current="step">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
            <span className="text-xs font-semibold text-foreground">{STEPS[0]}</span>
          </span>
        )}
      </li>
      <li aria-hidden="true" className={cn("h-px flex-1 transition-colors", step === 2 ? "bg-foreground/30" : "bg-border")} />
      <li className="flex items-center gap-2" aria-current={step === 2 ? "step" : undefined}>
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
            step === 2 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
          )}
        >
          2
        </span>
        <span className={cn("text-xs font-semibold", step === 2 ? "text-foreground" : "text-muted-foreground")}>{STEPS[1]}</span>
      </li>
    </ol>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title="Manual Review"
        description="Run an AI review on a specific commit or pull request. Confirm the scope, then follow the live progress."
      />

      {noRepos ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<FolderGit2 />}
              title="No repositories configured"
              description="Add a repository with its Bitbucket connection before running a manual review."
              action={<Button onClick={() => navigate("/settings")}>Open settings</Button>}
            />
          </CardContent>
        </Card>
      ) : submitting ? (
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  <Loader2 className="animate-spin" />
                  {mode === "commit" ? "Commit review" : "PR review"}
                </Badge>
              </div>
              <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label={`Elapsed ${elapsed} seconds`}>
                {formatElapsed(elapsed)}
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div className="h-full w-1/2 rounded-full bg-foreground/70 animate-[loading-bar_1.8s_ease-in-out_infinite]" />
            </div>

            <p className="min-h-5 text-sm text-foreground" role="status" aria-live="polite">
              {streamStatus || "Connecting to review stream..."}
            </p>

            <p className="text-xs text-muted-foreground">
              {selectedRepo ? selectedRepo.name : "Repository"}
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="font-mono">{conflictLabel}</span>
            </p>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={cancelActiveReview}
              disabled={!activeReviewId || cancelRequested}
            >
              <XCircle />
              {cancelRequested ? "Waiting for the model to stop..." : "Cancel review"}
            </Button>

            {activeReviewId && !cancelRequested && (
              <p className="text-center text-xs text-muted-foreground">
                Press <Kbd>Esc</Kbd> to cancel
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-6 pt-5">
            {renderStepper}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  variants={stepVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-4"
                >
                  {step === 1 ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="repo-select" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Repository
                        </Label>
                        <Select
                          value={repoId}
                          onValueChange={handleRepoChange}
                          onOpenChange={(open: boolean) => { if (!open) setTouched((t) => ({ ...t, repo: true })); }}
                        >
                          <SelectTrigger
                            id="repo-select"
                            aria-invalid={repoError ? true : undefined}
                            aria-describedby={repoError ? "repo-error" : undefined}
                            className={cn("h-11 bg-background border-border", repoError && "border-destructive focus-visible:ring-destructive/50")}
                          >
                            <SelectValue placeholder="Select repository" />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingRepos ? (
                              <SelectItem value="_loading" disabled>Loading repositories...</SelectItem>
                            ) : (
                              (repos as Repository[]).map((repo) => (
                                <SelectItem key={repo.id} value={String(repo.id)}>{repo.name}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {repoError && (
                          <p id="repo-error" className="text-xs text-destructive">
                            {repoError}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Review type</span>
                        <div role="tablist" aria-label="Review type" className="grid w-full grid-cols-2 border-b border-border text-xs font-semibold">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "commit"}
                            tabIndex={mode === "commit" ? 0 : -1}
                            onClick={() => handleModeChange("commit")}
                            onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); handleModeChange("pr"); document.getElementById("review-mode-pr")?.focus(); } }}
                            id="review-mode-commit"
                            aria-controls="review-panel-commit"
                            className={cn(
                              "-mb-px flex items-center justify-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors",
                              mode === "commit" ? "border-interactive text-interactive" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <GitCommit className="h-3.5 w-3.5" />Commit
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "pr"}
                            tabIndex={mode === "pr" ? 0 : -1}
                            onClick={() => handleModeChange("pr")}
                            onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); handleModeChange("commit"); document.getElementById("review-mode-commit")?.focus(); } }}
                            id="review-mode-pr"
                            aria-controls="review-panel-pr"
                            className={cn(
                              "-mb-px flex items-center justify-center gap-1.5 border-b-2 px-4 py-2.5 transition-colors",
                              mode === "pr" ? "border-interactive text-interactive" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <GitPullRequest className="h-3.5 w-3.5" />Pull request
                          </button>
                        </div>
                      </div>

                      {mode === "commit" ? (
                        <div role="tabpanel" id="review-panel-commit" aria-labelledby="review-mode-commit" className="space-y-2">
                          <Label htmlFor="commit-hash" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Commit hash
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="commit-hash"
                              ref={commitInputRef}
                              value={commitHash}
                              onChange={(e) => setCommitHash(e.target.value)}
                              onBlur={() => setTouched((t) => ({ ...t, commit: true }))}
                              placeholder="e.g. 7f8e9a2"
                              error={commitError ? true : undefined}
                              aria-invalid={commitError ? true : undefined}
                              aria-describedby={commitError ? "commit-hash-error" : "commit-hash-hint"}
                              className="h-11 bg-background border-border font-mono text-sm"
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 shrink-0 px-3"
                              onClick={pasteFromClipboard}
                              aria-label="Paste commit hash from clipboard"
                            >
                              <ClipboardPaste />
                              Paste
                            </Button>
                          </div>
                          {commitError ? (
                            <p id="commit-hash-error" className="text-xs text-destructive">
                              {commitError}
                            </p>
                          ) : (
                            <p id="commit-hash-hint" className="text-xs text-muted-foreground">
                              7-40 hexadecimal characters. Press <Kbd>Enter</Kbd> to continue.
                            </p>
                          )}

                          {visibleRecents.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent</span>
                              {visibleRecents.map((target) => (
                                <button
                                  key={`${target.repoId}:${target.hash}`}
                                  type="button"
                                  onClick={() => applyRecentTarget(target)}
                                  aria-label={`Reuse ${target.repoName} commit ${target.hash}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-interactive/40 hover:text-foreground"
                                >
                                  <span>{target.repoName}</span>
                                  <span className="font-mono">{target.hash.substring(0, 7)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div role="tabpanel" id="review-panel-pr" aria-labelledby="review-mode-pr" className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="pr-target" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Pull request
                            </Label>
                            {repoId && (
                              <button
                                type="button"
                                onClick={() => loadOpenPrs(repoId)}
                                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <RefreshCw className={cn("h-3 w-3", loadingPrs && "animate-spin")} />
                                {loadingPrs ? "Loading..." : "Refresh"}
                              </button>
                            )}
                          </div>

                          {openPrs.length > 0 ? (
                            <Select
                              value={prId}
                              onValueChange={setPrId}
                              onOpenChange={(open: boolean) => { if (!open) setTouched((t) => ({ ...t, pr: true })); }}
                            >
                              <SelectTrigger
                                id="pr-target"
                                aria-invalid={prError ? true : undefined}
                                aria-describedby={prError ? "pr-error" : undefined}
                                className={cn("h-11 bg-background border-border", prError && "border-destructive focus-visible:ring-destructive/50")}
                              >
                                <SelectValue placeholder="Select a pull request" />
                              </SelectTrigger>
                              <SelectContent>
                                {openPrs.map((pr) => (
                                  <SelectItem key={pr.id} value={pr.id}>
                                    <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{pr.id}</span>
                                    <span className="truncate">{pr.title}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id="pr-target"
                              value={prId}
                              onChange={(e) => setPrId(e.target.value)}
                              onBlur={() => setTouched((t) => ({ ...t, pr: true }))}
                              placeholder={repoId ? "Enter PR number (e.g. 42)" : "Select a repository first"}
                              error={prError ? true : undefined}
                              aria-invalid={prError ? true : undefined}
                              aria-describedby={prError ? "pr-error" : undefined}
                              disabled={!repoId}
                              className="h-11 bg-background border-border font-mono text-sm"
                              autoComplete="off"
                            />
                          )}

                          {prError && (
                            <p id="pr-error" className="text-xs text-destructive">
                              {prError}
                            </p>
                          )}
                          {loadingPrs && <p className="text-xs text-muted-foreground">Loading open pull requests...</p>}
                          {!loadingPrs && prsLoaded && openPrs.length === 0 && (
                            <p className="text-xs text-muted-foreground">No open pull requests found. You can still enter a PR number.</p>
                          )}
                          {!loadingPrs && prLoadError && <p className="text-xs text-destructive">{prLoadError}</p>}

                          {selectedPr && (
                            <div className="space-y-0.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
                              <p><span className="font-medium text-foreground">{selectedPr.title}</span></p>
                              <p>{selectedPr.sourceBranch} → {selectedPr.destinationBranch} · by {selectedPr.author}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repository</dt>
                        <dd className="text-right text-sm">
                          <span className="font-medium">{selectedRepo?.name ?? "Unknown"}</span>
                          {selectedRepo?.branch && (
                            <span className="block font-mono text-xs text-muted-foreground">{selectedRepo.branch}</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mode</dt>
                        <dd className="flex items-center gap-1.5 text-sm font-medium">
                          {mode === "commit" ? <GitCommit className="h-3.5 w-3.5 text-muted-foreground" /> : <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />}
                          {mode === "commit" ? "Commit review" : "Pull request review"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target</dt>
                        <dd className="max-w-[60%] break-all text-right text-sm">
                          {mode === "commit" ? (
                            <span className="font-mono">{commitHash}</span>
                          ) : selectedPr ? (
                            <span>
                              <span className="font-mono text-xs text-muted-foreground">#{selectedPr.id}</span>{" "}
                              {selectedPr.title}
                            </span>
                          ) : (
                            <span className="font-mono">PR #{prId}</span>
                          )}
                        </dd>
                      </div>
                      {selectedRepo?.strictness && (
                        <div className="flex items-center justify-between gap-4 px-4 py-3">
                          <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Strictness</dt>
                          <dd>
                            <Badge variant="secondary" className="capitalize">{selectedRepo.strictness.replace(/_/g, " ")}</Badge>
                          </dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estimated cost</dt>
                        <dd className="text-right text-sm">
                          {estimating ? (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Estimating...
                            </span>
                          ) : estimate?.key === estimateKey && estimate.data ? (
                            <span>
                              <span className="font-semibold tabular-nums">${estimate.data.estimatedMaxCost.toFixed(4)}</span>
                              <span className="block text-xs text-muted-foreground">
                                {estimate.data.changedFiles} file{estimate.data.changedFiles === 1 ? "" : "s"} ·{" "}
                                {estimate.data.passes} pass{estimate.data.passes === 1 ? "" : "es"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Shown before running</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-xs text-muted-foreground">Step {step} of 2</span>
                <div className="flex items-center gap-2">
                  {step === 2 && (
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft />
                      Back
                    </Button>
                  )}
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Kbd>Enter</Kbd>
                  </span>
                  <Button type="submit" disabled={preflighting} loading={preflighting}>
                    {step === 1 ? (
                      <>Next<ArrowRight /></>
                    ) : (
                      <><Play />Run review</>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={cn("bg-card", resultBorderClass)}>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-3">
              <StatusBadge status="completed" />
              <span className="text-sm font-medium text-foreground">
                {findings.length === 0
                  ? "AI analysis completed — no issues found"
                  : `Found ${findings.length} ${findings.length === 1 ? "issue" : "issues"}`}
              </span>
            </div>

            {findings.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {mustFixCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <SeverityBadge level="must_fix" />
                    <span className="text-sm font-semibold tabular-nums">{mustFixCount}</span>
                  </span>
                )}
                {shouldFixCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <SeverityBadge level="should_fix_soon" />
                    <span className="text-sm font-semibold tabular-nums">{shouldFixCount}</span>
                  </span>
                )}
                {ignoreCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <SeverityBadge level="ignore" />
                    <span className="text-sm font-semibold tabular-nums">{ignoreCount}</span>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The diff was clean — nothing met the flagging threshold.</p>
            )}

            {result.pr && (
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">PR #{result.pr.id}:</span> {result.pr.title}</p>
                <p>{result.pr.sourceBranch} → {result.pr.destinationBranch} · by {result.pr.author}</p>
              </div>
            )}

            {result.reviewId && (
              <Button
                className="w-full font-bold"
                onClick={() => navigate(`/reviews/${result.reviewId}`)}
              >
                View detailed findings
                <ArrowRight />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Already reviewed
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <span>
                  <span className="font-mono text-foreground">{conflictLabel}</span>{" "}
                  has already been reviewed.
                </span>
                {mode === "commit" && resolvedHash && resolvedHash !== commitHash && (
                  <span className="block text-xs">
                    Your input <span className="font-mono text-foreground">{commitHash}</span> resolved to full hash{" "}
                    <span className="font-mono text-foreground">{resolvedHash.substring(0, 12)}</span>.
                  </span>
                )}
                <span className="block">Run a fresh review, or open the existing results.</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleViewExisting}>View existing review</Button>
            <Button onClick={handleReviewAgain} disabled={submitting}>
              {submitting ? `Reviewing... (${formatElapsed(elapsed)})` : "Run fresh review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preflightOpen} onOpenChange={setPreflightOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm review run</DialogTitle>
            <DialogDescription>Check the expected review size and maximum estimated cost before starting.</DialogDescription>
          </DialogHeader>
          {preflight && (
            <div className="space-y-4">
              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Review scope</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Changed files</p>
                    <p className="text-sm font-semibold tabular-nums">{preflight.changedFiles.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-secondary px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Review passes</p>
                    <p className="text-sm font-semibold tabular-nums">{preflight.passes}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Token estimate</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Estimated input</p>
                    <p className="text-sm font-semibold tabular-nums">{preflight.estimatedInputTokens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-secondary px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">Maximum output</p>
                    <p className="text-sm font-semibold tabular-nums">{preflight.estimatedMaxOutputTokens.toLocaleString()}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coverage</p>
                <div className="rounded-lg bg-secondary px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Diff characters analyzed</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {preflight.analyzedDiffCharacters.toLocaleString()} of {preflight.diffCharacters.toLocaleString()}
                  </p>
                  {preflight.truncated ? (
                    <p className="mt-1.5 text-xs font-medium text-warning">
                      Diff exceeds the review size limit and will be truncated — the tail of the diff will not be reviewed.
                    </p>
                  ) : coverageRatio < 1 ? (
                    coverageRatio >= 0.85 ? (
                      <p className="mt-1.5 text-xs font-medium text-warning">
                        Close to the review size limit — larger diffs may be truncated.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Large or excluded content will not be sent to the model.
                      </p>
                    )
                  ) : null}
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Model &amp; cost</p>
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <p className="break-all font-mono text-xs text-foreground">{preflight.model}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    Up to ${preflight.estimatedMaxCost.toFixed(4)}
                  </p>
                  {preflight.incremental && (
                    <p className="mt-1.5 text-xs text-success">Incremental review from the previous PR head.</p>
                  )}
                </div>
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreflightOpen(false)}>Cancel</Button>
            <Button onClick={() => { setPreflightOpen(false); submitReview(pendingForce); }}>Start review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
