import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

export function ReviewConfigTab() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  const updateRepo = async (id: string, body: Record<string, unknown>) => {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try { await api.put(`/api/repositories/${id}`, body); toast({ title: "Updated", variant: "success" }); dispatch(fetchRepositories()); } catch { toast({ title: "Error", variant: "destructive" }); } finally { setUpdating((prev) => ({ ...prev, [id]: false })); }
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">Configure review settings per repository</p>
      {repos.map((repo) => (
        <Card key={String(repo.id)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{String(repo.name)}</CardTitle>
            {updating[String(repo.id)] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Review Mode</Label>
                <Select defaultValue={String(repo.review_mode)} onValueChange={(v) => updateRepo(String(repo.id), { review_mode: v })} disabled={updating[String(repo.id)]}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="automatic">Automatic</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Strictness</Label>
                <Select defaultValue={String(repo.strictness)} onValueChange={(v) => updateRepo(String(repo.id), { strictness: v })} disabled={updating[String(repo.id)]}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="strict">Strict</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="light">Light</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Excluded Paths</Label>
              <Input defaultValue={String(repo.excluded_paths || "")} placeholder="node_modules/, *.min.js" onBlur={(e) => updateRepo(String(repo.id), { excluded_paths: e.target.value })} disabled={updating[String(repo.id)]} />
            </div>
            <Separator />
            <div className="flex items-center gap-4">
              <Label className="text-sm">Auto Review</Label>
              <Select defaultValue={Number(repo.auto_review_enabled) ? "on" : "off"} onValueChange={(v) => updateRepo(String(repo.id), { auto_review_enabled: v === "on" ? 1 : 0 })} disabled={updating[String(repo.id)]}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="on">On</SelectItem><SelectItem value="off">Off</SelectItem></SelectContent>
              </Select>
              <Label className="text-sm">Poll (min)</Label>
              <Input type="number" className="w-20" defaultValue={String(repo.poll_interval_minutes || 5)} onBlur={(e) => updateRepo(String(repo.id), { poll_interval_minutes: Number(e.target.value) })} disabled={updating[String(repo.id)]} />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
