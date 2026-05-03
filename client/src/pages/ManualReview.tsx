import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";

export default function ManualReview() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [repoId, setRepoId] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ cached?: boolean; reviewId?: string; review?: Record<string, unknown>; findings?: Record<string, unknown>[] } | null>(null);

  useEffect(() => { dispatch(fetchRepositories()); }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await api.post("/api/reviews/manual", { repository_id: repoId, commit_hash: commitHash });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Review Failed", description: data.error, variant: "destructive" });
      } else {
        setResult(data);
        toast({
          title: data.cached ? "Loaded from Cache" : "Review Completed",
          description: data.cached ? "This commit was already reviewed." : "Findings are ready.",
        });
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <BlurFade delay={0.05} duration={0.35} inView>
        <h2 className="text-3xl font-bold tracking-display">Manual Review</h2>
      </BlurFade>

      <BlurFade delay={0.1} duration={0.4} inView>
        <Card className="border-muted/30 bg-card/50 relative overflow-hidden">
          <BorderBeam size={60} duration={10} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.2)" borderWidth={1} />
          <CardHeader className="pb-4 border-b border-muted/10">
            <CardTitle className="text-lg font-semibold tracking-headline">Start a Review</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="repo" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repository</Label>
                <Select value={repoId} onValueChange={setRepoId}>
                  <SelectTrigger id="repo" className="bg-background/50 border-muted/30 h-11"><SelectValue placeholder="Select repository" /></SelectTrigger>
                  <SelectContent>
                    {(repos as Record<string, string>[]).map((repo) => (
                      <SelectItem key={repo.id} value={String(repo.id)}>{repo.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commit" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commit Hash</Label>
                <Input 
                  id="commit" 
                  value={commitHash} 
                  onChange={(e) => setCommitHash(e.target.value)} 
                  placeholder="Enter commit SHA (e.g. 7f8e9a2)" 
                  required 
                  className="bg-background/50 border-muted/30 h-11 font-mono text-sm"
                />
              </div>

              <ShimmerButton
                type="submit"
                disabled={submitting || !repoId || !commitHash}
                shimmerColor="rgba(129, 140, 248, 0.3)"
                background="hsl(var(--primary))"
                className="w-full h-11 rounded-lg font-bold"
              >
                {submitting ? "Reviewing with AI..." : "Start Review"}
              </ShimmerButton>
            </form>
          </CardContent>
        </Card>
      </BlurFade>

      {result && (
        <BlurFade delay={0.1} duration={0.4} inView>
          <Card className="border-primary/20 bg-primary/5 relative overflow-hidden">
            <BorderBeam size={40} duration={6} colorFrom="#818cf8" colorTo="#6366f1" borderWidth={1} />
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant={result.cached ? "secondary" : "default"} className="capitalize">
                  {result.cached ? "Cached" : "Completed"}
                </Badge>
                <span className="text-sm font-medium text-foreground">
                  {result.cached ? "Previously reviewed — showing cached results" : "AI analysis completed successfully"}
                </span>
              </div>
              {result.reviewId && (
                <Button asChild variant="secondary" className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-bold">
                  <a href={`/reviews/${result.reviewId}`}>View Detailed Findings</a>
                </Button>
              )}
              {result.findings && (
                <p className="text-xs text-muted-foreground text-center font-medium">Found {result.findings.length} issues in this commit</p>
              )}
            </CardContent>
          </Card>
        </BlurFade>
      )}
    </div>
  );
}
