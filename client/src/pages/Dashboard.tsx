import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviews } from "@/store/reviewsSlice";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileSearch, GitCommit, GitPullRequest, Trash2, User, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Review } from "@/types";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items: reviews, loading, total, statusCounts } = useSelector((state: RootState) => state.reviews);
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === "admin";

  const [filterRepo, setFilterRepo] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUser, setFilterUser] = useState("");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [deleting, setDeleting] = useState(false);

  const PAGE_SIZE = 20;

  const activeFilters = () => {
    const params: Record<string, string> = {};
    if (filterRepo !== "all") params.repository_id = filterRepo;
    if (filterStatus !== "all") params.status = filterStatus;
    if (filterType !== "all") params.review_mode = filterType;
    if (filterUser.trim()) params.created_by = filterUser.trim();
    return params;
  };

  useEffect(() => {
    dispatch(fetchReviews({ limit: PAGE_SIZE, offset: 0 }));
    dispatch(fetchRepositories());
  }, [dispatch]);

  useEffect(() => {
    setPage(0);
    dispatch(fetchReviews({ ...activeFilters(), limit: PAGE_SIZE, offset: 0 }));
  }, [filterRepo, filterStatus, filterType, filterUser]); // eslint-disable-line

  useEffect(() => {
    if (page > 0) {
      dispatch(fetchReviews({ ...activeFilters(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }));
    }
  }, [page]); // eslint-disable-line

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const stats = {
    total,
    ...statusCounts,
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/api/reviews/${deleteTarget.id}`);
      toast({ title: "Review deleted", variant: "success" });
      setDeleteTarget(null);
      dispatch(fetchReviews({ ...activeFilters(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }));
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="outline" className="capitalize bg-success/10 text-success border-success/20">{status}</Badge>;
      case "pending": return <Badge variant="outline" className="capitalize bg-warning/10 text-warning border-warning/20">{status}</Badge>;
      case "failed": return <Badge variant="outline" className="capitalize bg-destructive/10 text-destructive border-destructive/20">{status}</Badge>;
      default: return <Badge variant="outline" className="capitalize">{status}</Badge>;
    }
  };

  const typeBadge = (mode: string, commitHash: string) => {
    const isPr = mode === "pr" || commitHash?.startsWith("pr:");
    return isPr ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <GitPullRequest className="h-3.5 w-3.5" />PR
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <GitCommit className="h-3.5 w-3.5" />Commit
      </span>
    );
  };

  const identifier = (review: Review) => {
    const isPr = review.review_mode === "pr" || review.commit_hash?.startsWith("pr:");
    if (isPr) {
      return <span className="font-mono text-xs text-muted-foreground">#{review.commit_hash?.replace("pr:", "")}</span>;
    }
    return <span className="font-mono text-xs text-muted-foreground">{review.commit_hash?.substring(0, 10)}</span>;
  };

  const formatDate = (dt: string) => {
    const d = new Date(dt);
    return (
      <span>
        <span className="text-muted-foreground">{d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
        <span className="text-muted-foreground ml-1.5">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <Link to="/reviews/manual">
          <Button className="font-semibold shadow-sm">New Review</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {([
          { label: "Total Reviews", value: stats.total, color: "text-foreground", bg: "bg-secondary/50", icon: BarChart3 },
          { label: "Pending", value: stats.pending, color: "text-warning", bg: "bg-warning/5", icon: Clock },
          { label: "Completed", value: stats.completed, color: "text-success", bg: "bg-success/5", icon: CheckCircle2 },
          { label: "Failed", value: stats.failed, color: "text-destructive", bg: "bg-destructive/5", icon: XCircle },
        ] as const).map((stat) => (
          <Card key={stat.label} className={cn("border-border", stat.bg)}>
            <CardContent className="flex items-center gap-3 pt-6 pb-5">
              <stat.icon className={cn("h-8 w-8 flex-shrink-0", stat.color)} />
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                <span className={cn("block mt-0.5 text-3xl font-bold tracking-tight tabular-nums", stat.color)}>{stat.value}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5 items-center bg-secondary/50 rounded-lg px-3 py-2">
          <Select value={filterRepo} onValueChange={setFilterRepo}>
            <SelectTrigger className="w-52 bg-card border-border h-9 text-sm">
              <SelectValue placeholder="All Repositories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Repositories</SelectItem>
                {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>{repo.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 bg-card border-border h-9 text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pr">Pull Request</SelectItem>
              <SelectItem value="manual">Commit</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-card border-border h-9 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              placeholder="Filter by user"
              className="pl-8 w-40 bg-card border-border h-9 text-sm"
            />
          </div>
          {(filterRepo !== "all" || filterStatus !== "all" || filterType !== "all" || filterUser.trim()) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setFilterRepo("all"); setFilterStatus("all"); setFilterType("all"); setFilterUser(""); }}>
              Clear filters
            </Button>
          )}
        </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold tracking-headline">Recent Reviews</CardTitle>
              {total > 0 && (
                <span className="text-xs text-muted-foreground">{total} result{total !== 1 ? "s" : ""}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-px">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileSearch className="h-10 w-10 text-muted-foreground/50 mb-4" />
                <p className="text-sm font-medium text-muted-foreground mb-1">No reviews yet</p>
                <p className="text-xs text-muted-foreground mb-4">Try adjusting the filters or start a new review.</p>
                <Link to="/reviews/manual">
                  <Button size="sm" className="font-semibold shadow-sm">Start your first review</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground pl-4">Repository</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-24">Type</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-32">Identifier</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-28">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-28">Run By</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-44">Date</TableHead>
                    {isAdmin && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((review) => (
                    <TableRow
                      key={review.id}
                      className="cursor-pointer border-border hover:bg-accent transition-colors group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/reviews/${review.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/reviews/${review.id}`); } }}
                    >
                      <TableCell className="font-medium text-foreground pl-4 py-3">
                        {review.repository_name || review.repository_id}
                      </TableCell>
                      <TableCell className="py-3">{typeBadge(review.review_mode, review.commit_hash)}</TableCell>
                      <TableCell className="py-3">{identifier(review)}</TableCell>
                      <TableCell className="py-3">{statusBadge(review.status)}</TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs text-muted-foreground">
                          {review.created_by || <span className="text-muted-foreground">system</span>}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-xs">{formatDate(review.created_at)}</TableCell>
                      {isAdmin && (
                        <TableCell className="py-3 pr-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(review); }}
                            aria-label={`Delete review for ${review.repository_name || review.repository_id}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <Button
                      key={i}
                      variant={i === page ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0 text-xs"
                      onClick={() => setPage(i)}
                    >
                      {i + 1}
                    </Button>
                  )).slice(
                    Math.max(0, Math.min(page - 2, totalPages - 5)),
                    Math.min(totalPages, Math.max(page + 3, 5))
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Review
            </DialogTitle>
            <DialogDescription className="pt-1">
              Permanently delete the review for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.repository_name || deleteTarget?.repository_id}</span>
              {deleteTarget && (
                <span className="font-mono text-xs ml-1 text-muted-foreground">
                  ({identifier(deleteTarget)})
                </span>
              )}
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
