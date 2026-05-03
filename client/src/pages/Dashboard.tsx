import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviews } from "@/store/reviewsSlice";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: reviews, loading } = useSelector((state: RootState) => state.reviews);
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const [filterRepo, setFilterRepo] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    dispatch(fetchReviews({}));
    dispatch(fetchRepositories());
  }, [dispatch]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (filterRepo !== "all") params.repository_id = filterRepo;
    if (filterStatus !== "all") params.status = filterStatus;
    dispatch(fetchReviews(params));
  }, [filterRepo, filterStatus, dispatch]);

  const stats = {
    total: reviews.length,
    pending: reviews.filter((r: Record<string, unknown>) => r.status === "pending").length,
    completed: reviews.filter((r: Record<string, unknown>) => r.status === "completed").length,
    failed: reviews.filter((r: Record<string, unknown>) => r.status === "failed").length,
    mustFix: reviews.reduce((sum: number, r: Record<string, unknown>) => {
      const findings = r.findings as Record<string, unknown>[] | undefined;
      return sum + (findings?.filter((f) => f.risk_level === "must_fix").length ?? 0);
    }, 0),
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "default";
      case "pending": return "secondary";
      case "failed": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-8">
      <BlurFade delay={0.05} duration={0.35} inView>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-display">Dashboard</h2>
          <Link to="/reviews/manual">
            <Button className="font-semibold shadow-lg shadow-primary/20">New Review</Button>
          </Link>
        </div>
      </BlurFade>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total Reviews", value: stats.total, color: "text-foreground" },
          { label: "Pending", value: stats.pending, color: "text-yellow-500" },
          { label: "Completed", value: stats.completed, color: "text-green-500" },
          { label: "Must Fix", value: stats.mustFix, color: "text-red-500" },
        ].map((stat, i) => (
          <BlurFade key={i} delay={0.08 + i * 0.06} duration={0.4} inView>
            <Card className="border-muted/50 transition-colors hover:border-muted-foreground/20 relative overflow-hidden">
              <CardContent className="flex flex-col items-center justify-center pt-6 text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                <NumberTicker value={stat.value} className={cn("mt-1 text-3xl font-bold tracking-tight", stat.color)} />
              </CardContent>
            </Card>
          </BlurFade>
        ))}
      </div>

      <BlurFade delay={0.3} duration={0.4} inView>
        <div className="flex gap-3">
          <Select value={filterRepo} onValueChange={setFilterRepo}>
            <SelectTrigger className="w-48 bg-card/50 border-muted/50"><SelectValue placeholder="All Repositories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Repositories</SelectItem>
              {(repos as Record<string, string>[]).map((repo) => (
                <SelectItem key={repo.id} value={String(repo.id)}>{repo.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 bg-card/50 border-muted/50"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </BlurFade>

      <BlurFade delay={0.35} duration={0.4} inView>
        <Card className="border-muted/50 bg-card/50 relative overflow-hidden">
          <BorderBeam size={80} duration={8} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.3)" borderWidth={1} />
          <CardHeader className="border-b border-muted/20 pb-4">
            <CardTitle className="text-lg font-semibold tracking-headline">Recent Reviews</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : reviews.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No reviews yet. Start a manual review to begin.</p>
            ) : (
              <div>
                {(reviews as Record<string, string>[]).map((review, i) => (
                  <BlurFade key={review.id} delay={0.02 * i} duration={0.3} inView>
                  <Link to={`/reviews/${review.id}`} className="flex items-center justify-between py-4 border-b border-muted/20 hover:bg-accent/50 transition-colors group px-4 -mx-4 rounded-lg">
                    <div>
                      <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{review.repository_name || review.repository_id}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{review.commit_hash?.substring(0, 8)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={statusColor(String(review.status)) as "default" | "secondary" | "destructive" | "outline"} className="capitalize">
                        {String(review.status)}
                      </Badge>
                    </div>
                  </Link>
                  </BlurFade>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  );
}
