import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import type { Finding } from "@/types";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Trash2, Mail, ChevronDown, ChevronUp, GitCommitHorizontal, GitBranch, Shield, FileSearch, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { review, findings, loading } = useSelector((state: RootState) => state.reviewDetail);
  const user = useSelector((state: RootState) => state.auth.user);
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailVisible, setEmailVisible] = useState(false);

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!review) return <p className="py-8 text-center text-muted-foreground">Review not found</p>;

  const grouped = {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };

  const riskBadgeStyles = (risk: string) => {
    switch (risk) {
      case "must_fix": return "bg-destructive/10 text-destructive border-destructive/20";
      case "should_fix_soon": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      default: return "bg-secondary text-muted-foreground border-border";
    }
  };

  const isPrReview = String(review.commit_hash).startsWith("pr:");
  const prId = isPrReview ? String(review.commit_hash).replace("pr:", "") : null;
  const repoName = String(review.repository_name || review.repository_id);
  const branch = String(review.branch || "N/A");
  const aiOverview = String(review.ai_overview || "Review completed.");

  const formatFinding = (f: Finding, index: number) => {
    const location = f.file_path + (f.line_number ? `:${f.line_number}` : "");
    const category = f.category ? ` [${f.category}]` : "";
    const fix = f.suggested_fix
      ? `\n     Suggested Fix:\n       ${f.suggested_fix.replace(/\n/g, "\n       ")}`
      : "";
    return `  ${index + 1}. ${f.summary}${category}\n     File: ${location}\n     ${f.explanation}${fix}`;
  };

  const sectionBlock = (label: string, items: Finding[]) => {
    if (items.length === 0) return "";
    return `${label} (${items.length}):\n\n${items.map(formatFinding).join("\n\n")}\n\n`;
  };

  const findingsBody = findings.length === 0
    ? "No issues found. The diff looks clean.\n"
    : `${sectionBlock("MUST FIX", grouped.must_fix)}${sectionBlock("SHOULD FIX SOON", grouped.should_fix_soon)}${sectionBlock("CAN IGNORE", grouped.ignore)}`;

  const emailBody = `Hi Team,

AutoReview completed a code review for ${repoName}.

─────────────────────────────────────────────
OVERVIEW
─────────────────────────────────────────────

${aiOverview}

─────────────────────────────────────────────
SUMMARY
─────────────────────────────────────────────
  Must Fix        : ${grouped.must_fix.length}
  Should Fix Soon : ${grouped.should_fix_soon.length}
  Can Ignore      : ${grouped.ignore.length}
  Total Findings  : ${findings.length}

─────────────────────────────────────────────
FINDINGS
─────────────────────────────────────────────

${findingsBody}─────────────────────────────────────────────

Regards,
AutoReview`;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/reviews/${id}`);
      toast({ title: "Review deleted" });
      navigate("/");
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const totalFindings = findings.length;
  const worstRisk = grouped.must_fix.length > 0 ? "critical" : grouped.should_fix_soon.length > 0 ? "warning" : "clean";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <BlurFade delay={0.05} duration={0.35} inView>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-display">Review Detail</h2>
          <div className="flex items-center gap-2">
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
            <Button variant="outline" size="sm" className="border-border bg-card hover:bg-accent" onClick={() => navigate("/")}>
              Back
            </Button>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.1} duration={0.4} inView>
        <Card className="border-border bg-card relative overflow-hidden">
          <BorderBeam size={80} duration={12} colorFrom="#e5e5e5" colorTo="#e5e5e51a" borderWidth={1} />
          <CardContent className="pt-6 pb-5">
            <div className="flex items-start justify-between gap-6 mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  worstRisk === "critical" ? "bg-destructive/10" : worstRisk === "warning" ? "bg-yellow-500/10" : "bg-emerald-500/10"
                )}>
                  <Shield className={cn(
                    "h-5 w-5",
                    worstRisk === "critical" ? "text-destructive" : worstRisk === "warning" ? "text-yellow-600" : "text-emerald-600"
                  )} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{repoName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isPrReview ? `Pull Request #${prId}` : "Commit Review"}
                    {review.completed_at && ` · ${new Date(String(review.completed_at)).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Badge variant={review.status === "completed" ? "default" : "destructive"} className="capitalize">{String(review.status)}</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Branch</p>
                  <p className="text-sm font-medium text-foreground">{branch}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Commit</p>
                  <p className="text-sm font-mono text-foreground">{isPrReview ? `PR #${prId}` : String(review.commit_hash).substring(0, 8)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mode</p>
                  <p className="text-sm font-medium capitalize text-foreground">{String(review.review_mode)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Strictness</p>
                  <p className="text-sm font-medium capitalize text-foreground">{String(review.strictness)}</p>
                </div>
              </div>
            </div>

            {aiOverview && aiOverview !== "Review completed." && (
              <div className="mt-4 rounded-lg border border-border p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">AI Overview</p>
                <p className="text-sm leading-relaxed text-foreground">{aiOverview}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </BlurFade>

      <div className="grid grid-cols-4 gap-3">
        <BlurFade delay={0.15} duration={0.3} inView>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">Must Fix</p>
            <NumberTicker value={grouped.must_fix.length} className="text-2xl font-bold text-destructive" />
          </div>
        </BlurFade>
        <BlurFade delay={0.18} duration={0.3} inView>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-600">Should Fix</p>
            <NumberTicker value={grouped.should_fix_soon.length} className="text-2xl font-bold text-yellow-600" />
          </div>
        </BlurFade>
        <BlurFade delay={0.21} duration={0.3} inView>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ignored</p>
            <NumberTicker value={grouped.ignore.length} className="text-2xl font-bold text-foreground" />
          </div>
        </BlurFade>
        <BlurFade delay={0.24} duration={0.3} inView>
          <div className="p-4 rounded-xl border border-border bg-card text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
            <NumberTicker value={totalFindings} className="text-2xl font-bold text-foreground" />
          </div>
        </BlurFade>
      </div>

      {(["must_fix", "should_fix_soon", "ignore"] as const).map((level, groupIdx) => {
        const items = grouped[level];
        if (items.length === 0) return null;
        return (
          <div key={level} className="space-y-3">
            <BlurFade delay={0.3 + groupIdx * 0.08} duration={0.35} inView>
              <div className="flex items-center gap-3 pt-2">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  level === "must_fix" ? "bg-destructive" : level === "should_fix_soon" ? "bg-yellow-500" : "bg-muted-foreground"
                )} />
                <h3 className="text-lg font-bold tracking-tight capitalize text-foreground">{level.replace("_", " ")}</h3>
                <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "finding" : "findings"}</span>
              </div>
            </BlurFade>
            {items.map((finding, i) => (
              <BlurFade key={finding.id} delay={0.02 * i} duration={0.3} inView>
                <Card className="border-border shadow-sm overflow-hidden">
                  <div className={cn(
                    "h-0.5 w-full",
                    level === "must_fix" ? "bg-destructive" : level === "should_fix_soon" ? "bg-yellow-500" : "bg-border"
                  )} />
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-foreground">{finding.summary}</p>
                        <p className="text-xs text-muted-foreground font-mono bg-secondary px-2 py-0.5 rounded inline-block">
                          {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 mt-0.5">
                        <Badge variant="outline" className={cn("capitalize border-0 text-[10px]", riskBadgeStyles(level))}>{level.replace("_", " ")}</Badge>
                        {finding.category != null && <Badge variant="outline" className="text-[10px] border-border">{finding.category}</Badge>}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{finding.explanation}</p>
                    {finding.suggested_fix != null && (
                      <div className="rounded-lg bg-secondary p-3 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Suggested Fix</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <code className="text-xs font-mono block text-foreground leading-relaxed whitespace-pre-wrap">{finding.suggested_fix}</code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </BlurFade>
            ))}
          </div>
        );
      })}

      <BlurFade delay={0.4} duration={0.35} inView>
        <Card className="border-border">
          <button
            onClick={() => setEmailVisible(!emailVisible)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent transition-colors rounded-t-lg"
          >
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Email Draft</span>
              {!emailVisible && <span className="text-xs text-muted-foreground">Click to preview</span>}
            </div>
            <div className="flex items-center gap-3">
              {emailVisible && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(emailBody); toast({ title: "Copied to clipboard" }); }}>
                  Copy
                </Button>
              )}
              {emailVisible ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {emailVisible && (
            <CardContent className="pt-0 pb-4 border-t border-border">
              <pre className="whitespace-pre-wrap rounded-md bg-secondary p-4 text-xs font-mono leading-relaxed mt-4">{emailBody}</pre>
            </CardContent>
          )}
        </Card>
      </BlurFade>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Review
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will permanently delete the review and all its findings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
