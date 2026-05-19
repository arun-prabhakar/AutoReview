import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviews } from "@/store/reviewsSlice";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BarChart3, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, FileSearch, GitCommit, GitPullRequest, Minus, Search, Trash2, User, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Review } from "@/types";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items: reviews, loading, total, statusCounts, initialLoad } = useSelector((state: RootState) => state.reviews);
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === "admin";

  const [filterRepo, setFilterRepo] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterAuthors, setFilterAuthors] = useState<string[]>([]);
  const [authorOptions, setAuthorOptions] = useState<string[]>([]);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [deleting, setDeleting] = useState(false);
  const authorDropdownRef = useRef<HTMLDivElement | null>(null);
  const pageEffectMounted = useRef(false);

  const PAGE_SIZE = 10;

  const activeFilters = () => {
    const params: { repository_id?: string; review_mode?: string; commit_author?: string[] } = {};
    if (filterRepo !== "all") params.repository_id = filterRepo;
    if (filterType !== "all") params.review_mode = filterType;
    if (filterAuthors.length > 0) params.commit_author = filterAuthors;
    return params;
  };

  useEffect(() => {
    dispatch(fetchReviews({ limit: PAGE_SIZE, offset: 0 }));
    dispatch(fetchRepositories());
  }, [dispatch]); // eslint-disable-line

  useEffect(() => {
    setPage(0);
    dispatch(fetchReviews({ ...activeFilters(), limit: PAGE_SIZE, offset: 0 }));
  }, [filterRepo, filterType, filterAuthors]); // eslint-disable-line

  useEffect(() => {
    if (!pageEffectMounted.current) {
      pageEffectMounted.current = true;
      return;
    }
    dispatch(fetchReviews({ ...activeFilters(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }));
  }, [page]); // eslint-disable-line

  useEffect(() => {
    const fetchAuthors = async () => {
      const query = new URLSearchParams();
      if (filterRepo !== "all") query.set("repository_id", filterRepo);
      if (filterType !== "all") query.set("review_mode", filterType);
      const authors = await api.get<string[]>(`/api/reviews/authors?${query.toString()}`);
      setAuthorOptions(authors);
      setFilterAuthors((selected) => selected.filter((author) => authors.includes(author)));
    };

    fetchAuthors().catch((err) => {
      toast({ title: "Failed to load authors", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    });
  }, [filterRepo, filterType, toast]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(event.target as Node)) {
        setAuthorDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

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

  const toggleAuthor = (author: string) => {
    setFilterAuthors((selected) =>
      selected.includes(author) ? selected.filter((item) => item !== author) : [...selected, author]
    );
  };

  const authorFilterLabel = filterAuthors.length === 0
    ? "All Authors"
    : filterAuthors.length === 1
      ? filterAuthors[0]
      : `${filterAuthors.length} Authors`;

  const FAILURE_LABELS: Record<string, string> = {
    llm_context_exceeded: "Context Exceeded",
    llm_rate_limited: "LLM Rate Limited",
    llm_auth_failed: "LLM Auth Failed",
    llm_unavailable: "LLM Unavailable",
    vcs_rate_limited: "VCS Rate Limited",
    vcs_auth_failed: "VCS Auth Failed",
    vcs_not_found: "Not Found",
    no_provider: "No LLM Provider",
    no_credential: "No Credential",
    internal_error: "Internal Error",
  };

  const statusIcon = (review: Review) => {
    if (review.status === "pending") {
      return <span title="In progress"><div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" /></span>;
    }
    if (review.status === "failed") {
      const label = review.failure_category && FAILURE_LABELS[review.failure_category] ? FAILURE_LABELS[review.failure_category] : "Failed";
      return <span title={label}><XCircle className="h-4 w-4 text-muted-foreground" /></span>;
    }
    const mustFix = review.must_fix_count ?? 0;
    const shouldFix = review.should_fix_count ?? 0;
    if (mustFix > 0) return <span title={`${mustFix} must-fix, ${shouldFix} should-fix`}><XCircle className="h-4 w-4 text-destructive" /></span>;
    if (shouldFix > 0) return <span title={`${shouldFix} should-fix`}><AlertTriangle className="h-4 w-4 text-warning" /></span>;
    return <span title="No issues found"><CheckCircle2 className="h-4 w-4 text-success" /></span>;
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
        <span className="text-muted-foreground ml-1.5">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </span>
    );
  };

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.length >= 2 ? (parts[parts.length - 1] ?? "") : "";
    if (first && last) return (first.charAt(0) + last.charAt(0)).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4">
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
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <stat.icon className={cn("h-5 w-5 flex-shrink-0", stat.color)} />
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                <span className={cn("block text-xl font-bold tracking-tight tabular-nums", stat.color)}>{stat.value}</span>
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

          <div className="relative" ref={authorDropdownRef}>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-48 justify-between bg-card border-border px-3 text-sm font-normal"
              onClick={() => { setAuthorDropdownOpen((open) => !open); setAuthorSearch(""); }}
              aria-haspopup="listbox"
              aria-expanded={authorDropdownOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{authorFilterLabel}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 flex-shrink-0 opacity-50 transition-transform", authorDropdownOpen && "rotate-180")} />
            </Button>
            {authorDropdownOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
                role="listbox"
                aria-label="Filter by author"
              >
                {authorOptions.length > 0 && (
                  <div className="px-2 pt-2 pb-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search authors..."
                        value={authorSearch}
                        onChange={(e) => setAuthorSearch(e.target.value)}
                        className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                )}
                {(() => {
                  const filtered = authorSearch
                    ? authorOptions.filter((a) => a.toLowerCase().includes(authorSearch.toLowerCase()))
                    : authorOptions;
                  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => filterAuthors.includes(a));
                  const someFilteredSelected = filtered.some((a) => filterAuthors.includes(a)) && !allFilteredSelected;

                  if (authorOptions.length === 0) {
                    return <div className="px-3 py-2 text-xs text-muted-foreground">No authors found</div>;
                  }

                  return (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
                        onClick={() => {
                          if (allFilteredSelected) {
                            setFilterAuthors((prev) => prev.filter((a) => !filtered.includes(a)));
                          } else {
                            const merged = [...new Set([...filterAuthors, ...filtered])];
                            setFilterAuthors(merged);
                          }
                        }}
                      >
                        <span className={cn(
                          "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                          allFilteredSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : someFilteredSelected
                              ? "border-primary bg-primary/10"
                              : "border-muted-foreground/40"
                        )}>
                          {allFilteredSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                          {someFilteredSelected && !allFilteredSelected && <Minus className="h-2.5 w-2.5" />}
                        </span>
                        <span>{allFilteredSelected ? "Clear all" : "Select all"}</span>
                        <span className="ml-auto tabular-nums">{filterAuthors.length > 0 ? `${filterAuthors.filter((a) => filtered.includes(a)).length}/${filtered.length}` : `${filtered.length}`}</span>
                      </button>
                      <div className="mx-2 border-t border-border" />
                      <div className="max-h-56 overflow-y-auto py-0.5">
                        {filtered.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                        ) : (
                          filtered.map((author) => {
                            const selected = filterAuthors.includes(author);
                            return (
                              <button
                                key={author}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent"
                                onClick={() => toggleAuthor(author)}
                              >
                                <span className={cn(
                                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                                  selected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground/40"
                                )}>
                                  {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                </span>
                                <span className="truncate text-sm">{author}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          {(filterRepo !== "all" || filterType !== "all" || filterAuthors.length > 0) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setFilterRepo("all"); setFilterType("all"); setFilterAuthors([]); }}>
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
          <CardContent className="p-0 relative">
            {initialLoad ? (
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
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground pl-4 w-10" />
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-32 max-w-32">Repository</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-20">Type</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Description</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-28">Author</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-28">Run By</TableHead>
                    <TableHead className="text-xs uppercase tracking-widest font-bold text-muted-foreground w-40">Date</TableHead>
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
                      <TableCell className="pl-4 py-3 w-10">
                        {statusIcon(review)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground py-3 max-w-32 truncate">
                        {review.repository_name || review.repository_id}
                      </TableCell>
                      <TableCell className="py-3">{typeBadge(review.review_mode, review.commit_hash)}</TableCell>
                      <TableCell className="py-3 max-w-xs">
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {review.ai_overview || identifier(review)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        {review.commit_author ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-secondary text-[10px] font-bold text-foreground" title={review.commit_author}>
                            {initials(review.commit_author)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 transition-opacity inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
            {loading && !initialLoad && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-b-lg">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
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
