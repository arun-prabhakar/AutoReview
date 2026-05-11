import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { SuppressionRule, Repository } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SuppressionsTab() {
  const [rules, setRules] = useState<SuppressionRule[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newRule, setNewRule] = useState({ repository_id: "", category: "", file_pattern: "", summary_pattern: "", risk_level: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesData, reposData] = await Promise.all([
        api.get<SuppressionRule[]>("/api/suppressions"),
        api.get<{ items: Repository[] }>("/api/repositories"),
      ]);
      setRules(rulesData);
      setRepos(reposData.items || []);
    } catch {
      toast({ title: "Failed to load suppression rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newRule.repository_id || !newRule.reason) {
      toast({ title: "Repository and reason are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/suppressions", {
        repository_id: newRule.repository_id,
        category: newRule.category || null,
        file_pattern: newRule.file_pattern || null,
        summary_pattern: newRule.summary_pattern || null,
        risk_level: newRule.risk_level || null,
        reason: newRule.reason,
      });
      toast({ title: "Suppression rule created", variant: "success" });
      setAddOpen(false);
      setNewRule({ repository_id: "", category: "", file_pattern: "", summary_pattern: "", risk_level: "", reason: "" });
      loadData();
    } catch (err) {
      toast({ title: "Failed to create rule", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.del(`/api/suppressions/${id}`);
      toast({ title: "Rule deleted", variant: "success" });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast({ title: "Failed to delete rule", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/api/suppressions/${id}/toggle`, { enabled: !enabled });
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !enabled } : r));
    } catch (err) {
      toast({ title: "Failed to toggle rule", variant: "destructive" });
    }
  };

  const repoName = (repoId: string) => repos.find((r) => r.id === repoId)?.name || repoId.substring(0, 8);

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Automatically suppress known false positive findings from reviews.</p>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Rule</Button>
      </div>

      {rules.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No suppression rules configured.</p>
            <p className="text-xs text-muted-foreground mt-1">Create rules to automatically filter out known false positives.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={cn("border-border", !rule.enabled && "opacity-50")}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{repoName(rule.repository_id)}</span>
                    {rule.category && <Badge variant="outline" className="text-xs">{rule.category}</Badge>}
                    {rule.risk_level && <Badge variant="outline" className="text-xs">{rule.risk_level}</Badge>}
                    {rule.file_pattern && <code className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{rule.file_pattern}</code>}
                    {rule.summary_pattern && <code className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">/{rule.summary_pattern}/i</code>}
                  </div>
                  <p className="text-xs text-muted-foreground">{rule.reason}</p>
                  <p className="text-[10px] text-muted-foreground">by {rule.created_by} · {new Date(rule.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(rule.id, rule.enabled)} title={rule.enabled ? "Disable" : "Enable"}>
                    {rule.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(rule.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Suppression Rule</DialogTitle>
            <DialogDescription>Matching findings will be automatically suppressed during reviews.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={newRule.repository_id} onValueChange={(v) => setNewRule((p) => ({ ...p, repository_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Repository" /></SelectTrigger>
              <SelectContent>
                {repos.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select value={newRule.category} onValueChange={(v) => setNewRule((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Category (any)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="correctness">Correctness</SelectItem>
                  <SelectItem value="maintainability">Maintainability</SelectItem>
                  <SelectItem value="style">Style</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newRule.risk_level} onValueChange={(v) => setNewRule((p) => ({ ...p, risk_level: v }))}>
                <SelectTrigger><SelectValue placeholder="Risk Level (any)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="must_fix">Must Fix</SelectItem>
                  <SelectItem value="should_fix_soon">Should Fix Soon</SelectItem>
                  <SelectItem value="ignore">Ignore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="File pattern (e.g. *.test.ts)" value={newRule.file_pattern} onChange={(e) => setNewRule((p) => ({ ...p, file_pattern: e.target.value }))} />
            <Input placeholder="Summary pattern (regex)" value={newRule.summary_pattern} onChange={(e) => setNewRule((p) => ({ ...p, summary_pattern: e.target.value }))} />
            <Input placeholder="Reason (required)" value={newRule.reason} onChange={(e) => setNewRule((p) => ({ ...p, reason: e.target.value }))} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !newRule.repository_id || !newRule.reason}>{saving ? "Saving..." : "Create Rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
