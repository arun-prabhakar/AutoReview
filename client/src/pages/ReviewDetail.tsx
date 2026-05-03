import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchReviewDetail } from "@/store/reviewDetailSlice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const { review, findings, loading } = useSelector((state: RootState) => state.reviewDetail);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    if (id) dispatch(fetchReviewDetail(id));
  }, [id, dispatch]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!review) return <p className="py-8 text-center text-muted-foreground">Review not found</p>;

  const grouped = {
    must_fix: findings.filter((f: Record<string, unknown>) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f: Record<string, unknown>) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f: Record<string, unknown>) => f.risk_level === "ignore"),
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "default";
      case "pending": return "secondary";
      case "failed": return "destructive";
      default: return "outline";
    }
  };

  const riskBadgeStyles = (risk: string) => {
    switch (risk) {
      case "must_fix": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "should_fix_soon": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const emailBody = `Hi Team,

AutoReview completed the code review.

Repository: ${String(review.repository_name || review.repository_id)}
Branch: ${String(review.branch || "N/A")}
Commit ID: ${String(review.commit_hash)}

Summary:
Must Fix: ${grouped.must_fix.length}
Should Fix Soon: ${grouped.should_fix_soon.length}
Can Ignore for Now: ${grouped.ignore.length}

Regards,
AutoReview`;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <BlurFade delay={0.05} duration={0.35} inView>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-display">Review Detail</h2>
          <Button asChild variant="outline" size="sm" className="border-muted/50 bg-card/50 hover:bg-accent/50">
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </div>
      </BlurFade>

      <BlurFade delay={0.1} duration={0.4} inView>
        <Card className="border-muted/30 bg-card/40 backdrop-blur-sm relative overflow-hidden">
          <BorderBeam size={80} duration={12} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0.2)" borderWidth={1} />
          <CardContent className="grid grid-cols-2 gap-6 pt-6 text-sm md:grid-cols-3">
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Repository</span><p className="font-semibold mt-0.5 text-foreground">{String(review.repository_name || review.repository_id)}</p></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Branch</span><p className="font-semibold mt-0.5 text-foreground">{String(review.branch || "N/A")}</p></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Commit</span><p className="font-mono text-xs mt-0.5 text-primary">{String(review.commit_hash).substring(0, 12)}</p></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mode</span><p className="font-semibold mt-0.5 capitalize text-foreground">{String(review.review_mode)}</p></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Strictness</span><p className="font-semibold mt-0.5 capitalize text-foreground">{String(review.strictness)}</p></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span><div className="mt-1"><Badge variant={statusColor(String(review.status)) as "default" | "secondary" | "destructive" | "outline"} className="capitalize">{String(review.status)}</Badge></div></div>
          </CardContent>
        </Card>
      </BlurFade>

      <div className="grid grid-cols-3 gap-4">
        <BlurFade delay={0.15} duration={0.35} inView>
          <div className="p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-center relative overflow-hidden">
            <BorderBeam size={50} duration={6} colorFrom="#ef4444" colorTo="#dc2626" borderWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/60">Must Fix</p>
            <NumberTicker value={grouped.must_fix.length} className="text-3xl font-bold text-red-500" />
          </div>
        </BlurFade>
        <BlurFade delay={0.2} duration={0.35} inView>
          <div className="p-4 rounded-xl border border-yellow-500/10 bg-yellow-500/5 text-center relative overflow-hidden">
            <BorderBeam size={50} duration={7} colorFrom="#eab308" colorTo="#ca8a04" borderWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-500/60">Should Fix Soon</p>
            <NumberTicker value={grouped.should_fix_soon.length} className="text-3xl font-bold text-yellow-500" />
          </div>
        </BlurFade>
        <BlurFade delay={0.25} duration={0.35} inView>
          <div className="p-4 rounded-xl border border-muted/10 bg-muted/5 text-center relative overflow-hidden">
            <BorderBeam size={50} duration={8} colorFrom="hsl(var(--muted-foreground))" colorTo="hsl(var(--muted))" borderWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ignore</p>
            <NumberTicker value={grouped.ignore.length} className="text-3xl font-bold text-foreground" />
          </div>
        </BlurFade>
      </div>

      {(["must_fix", "should_fix_soon", "ignore"] as const).map((level, groupIdx) => {
        const items = grouped[level];
        if (items.length === 0) return null;
        return (
          <div key={level} className="space-y-4 pt-4">
            <BlurFade delay={0.3 + groupIdx * 0.08} duration={0.35} inView>
              <h3 className="text-xl font-bold tracking-headline capitalize border-l-4 border-muted-foreground/20 pl-4">{level.replace("_", " ")}</h3>
            </BlurFade>
            {(items as Record<string, unknown>[]).map((finding, i) => (
              <BlurFade key={String(finding.id)} delay={0.02 * i} duration={0.3} inView>
                <Card className="border-muted/30 hover:border-muted/50 transition-colors shadow-sm overflow-hidden">
                  <div className="h-1 w-full bg-muted/10" />
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-bold text-base tracking-tight text-foreground">{String(finding.summary)}</p>
                        <p className="text-xs text-primary font-mono bg-primary/5 px-2 py-0.5 rounded-sm inline-block">
                          {String(finding.file_path)}{finding.line_number ? `:${String(finding.line_number)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 mt-1">
                        <Badge variant="outline" className={cn("capitalize border-0", riskBadgeStyles(level))}>{level.replace("_", " ")}</Badge>
                        {finding.category != null && <Badge variant="outline" className="text-[10px] border-muted/30">{String(finding.category)}</Badge>}
                      </div>
                    </div>
                    <p className="text-[14px] leading-relaxed text-muted-foreground">{String(finding.explanation)}</p>
                    {finding.suggested_fix != null && (
                      <div className="rounded-lg bg-muted/30 p-4 border border-muted/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Suggested Fix</span>
                          <div className="h-px flex-1 bg-primary/10" />
                        </div>
                        <code className="text-xs font-mono block text-foreground leading-relaxed whitespace-pre-wrap">
                          {String(finding.suggested_fix)}
                        </code>
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
        <Collapsible open={emailOpen} onOpenChange={setEmailOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 rounded-t-lg transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Email Draft</CardTitle>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", emailOpen && "rotate-180")} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{emailBody}</pre>
                <Separator className="my-4" />
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(emailBody)}>Copy to Clipboard</Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </BlurFade>
    </div>
  );
}
