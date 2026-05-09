import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { type RootState, type AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, GitCommit, GitPullRequest, RefreshCw } from "lucide-react";
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

export default function ManualReview() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();

  const [mode, setMode] = useState<"commit" | "pr">("pr");
  const [repoId, setRepoId] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [prId, setPrId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);
  const [resolvedHash, setResolvedHash] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openPrs, setOpenPrs] = useState<OpenPr[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const loadOpenPrs = async (selectedRepoId: string) => {
    if (!selectedRepoId) return;
    setLoadingPrs(true);
    setOpenPrs([]);
    try {
      const data = await api.get<OpenPr[]>(`/api/reviews/open-prs/${selectedRepoId}`);
      setOpenPrs(data);
    } catch {
      toast({ title: "Could not load open PRs", description: "Check repository credentials.", variant: "destructive" });
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

  const submitReview = async (force: boolean) => {
    setSubmitting(true);
    try {
      let data: ReviewResult;
      if (mode === "commit") {
        data = await api.post<ReviewResult>("/api/reviews/manual", {
          repository_id: repoId,
          commit_hash: commitHash,
          force,
        });
      } else {
        data = await api.post<ReviewResult>("/api/reviews/pr", {
          repository_id: repoId,
          pr_id: prId,
          force,
        });
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
      toast({ title: "Review Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitReview(false);
  };

  const handleViewExisting = () => {
    setConfirmOpen(false);
    if (existingReviewId) navigate(`/reviews/${existingReviewId}`);
  };

  const handleReviewAgain = () => {
    setConfirmOpen(false);
    submitReview(true);
  };

  const isSubmitDisabled = submitting || !repoId || (mode === "commit" ? !commitHash : !prId);

  const conflictLabel = mode === "commit"
    ? commitHash.substring(0, 12)
    : `PR #${prId}`;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Manual Review</h2>

        <Card className="border-border bg-card">
          <CardHeader className="pb-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold tracking-headline">Start a Review</CardTitle>
              <div className="flex rounded-lg bg-secondary p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => handleModeChange("commit")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors rounded-md ${mode === "commit" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  <GitCommit className="h-3.5 w-3.5" />Commit
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("pr")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors rounded-md ${mode === "pr" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />Pull Request
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="repo" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repository</Label>
                <Select value={repoId} onValueChange={handleRepoChange}>
                  <SelectTrigger id="repo" className="bg-background border-border h-11"><SelectValue placeholder="Select repository" /></SelectTrigger>
                  <SelectContent>
                    {(repos as Repository[]).map((repo) => (
                      <SelectItem key={repo.id} value={String(repo.id)}>{repo.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === "commit" ? (
                <div className="space-y-2">
                  <Label htmlFor="commit" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commit Hash</Label>
                  <Input
                    id="commit"
                    value={commitHash}
                    onChange={(e) => setCommitHash(e.target.value)}
                    placeholder="Enter commit SHA (e.g. 7f8e9a2)"
                    required
                    className="bg-background border-border h-11 font-mono text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pr-id" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pull Request ID</Label>
                    {repoId && (
                      <button
                        type="button"
                        onClick={() => loadOpenPrs(repoId)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingPrs ? "animate-spin" : ""}`} />
                        {loadingPrs ? "Loading..." : "Refresh"}
                      </button>
                    )}
                  </div>

                  {openPrs.length > 0 ? (
                    <Select value={prId} onValueChange={setPrId}>
                      <SelectTrigger id="pr-id" className="bg-background border-border h-11">
                        <SelectValue placeholder="Select a pull request" />
                      </SelectTrigger>
                      <SelectContent>
                        {openPrs.map((pr) => (
                          <SelectItem key={pr.id} value={pr.id}>
                            <span className="font-mono text-xs text-muted-foreground mr-1.5">#{pr.id}</span>
                            <span className="truncate">{pr.title}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="pr-id"
                      value={prId}
                      onChange={(e) => setPrId(e.target.value)}
                      placeholder={repoId ? "Enter PR number (e.g. 42)" : "Select a repository first"}
                      required
                      disabled={!repoId}
                      className="bg-background border-border h-11 font-mono text-sm"
                    />
                  )}

                  {prId && openPrs.length > 0 && (() => {
                    const selected = openPrs.find((p) => p.id === prId);
                    return selected ? (
                      <div className="rounded-md bg-secondary border border-border px-3 py-2 text-xs space-y-0.5 text-muted-foreground">
                        <p><span className="font-medium text-foreground">{selected.title}</span></p>
                        <p>{selected.sourceBranch} → {selected.destinationBranch} · by {selected.author}</p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitDisabled}
                className={cn("w-full h-11 rounded-lg font-bold", submitting && "animate-pulse")}
              >
                {submitting ? `Reviewing with AI... (${elapsed}s)` : mode === "pr" ? "Review Pull Request" : "Start Review"}
              </Button>
            </form>
          </CardContent>
        </Card>

      {result && (
          <Card className="border-border bg-secondary border-success/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="capitalize">Completed</Badge>
                <span className="text-sm font-medium text-foreground">AI analysis completed successfully</span>
              </div>
              {result.findings && result.findings.length > 0 && (() => {
                const mustFixCount = result.findings.filter((f) => f.risk_level === "must_fix").length;
                const shouldFixCount = result.findings.filter((f) => f.risk_level === "should_fix_soon").length;
                const ignoreCount = result.findings.filter((f) => f.risk_level === "ignore").length;
                return (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />{mustFixCount}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />{shouldFixCount}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />{ignoreCount}</span>
                  </div>
                );
              })()}
              {result.pr && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><span className="font-medium text-foreground">PR #{result.pr.id}:</span> {result.pr.title}</p>
                  <p>{result.pr.sourceBranch} → {result.pr.destinationBranch} · by {result.pr.author}</p>
                </div>
              )}
              {result.reviewId && (
                <Button
                  variant="secondary"
                  className="w-full bg-secondary hover:bg-secondary text-foreground border border-border font-bold"
                  onClick={() => navigate(`/reviews/${result.reviewId}`)}
                >
                  View Detailed Findings
                </Button>
              )}
              {result.findings && (
                <p className="text-xs text-muted-foreground text-center font-medium">Found {result.findings.length} issues</p>
              )}
            </CardContent>
          </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Already Reviewed
            </DialogTitle>
            <DialogDescription className="pt-1 space-y-1">
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
              <span className="block">Would you like to run a fresh review, or view the existing results?</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleViewExisting}>View Existing Review</Button>
            <Button onClick={handleReviewAgain} disabled={submitting}>
              {submitting ? `Reviewing... (${elapsed}s)` : "Review Again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
