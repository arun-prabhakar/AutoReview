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

export function NotificationsTab() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const saveSmtp = async (repoId: string, patch: Record<string, unknown>) => {
    setSaving((prev) => ({ ...prev, [repoId]: true }));
    try { await api.put(`/api/settings/smtp/${repoId}`, patch); toast({ title: "SMTP updated", variant: "success" }); dispatch(fetchRepositories()); } catch { toast({ title: "Error", variant: "destructive" }); } finally { setSaving((prev) => ({ ...prev, [repoId]: false })); }
  };

  const updateRepo = async (id: string, body: Record<string, unknown>) => {
    setSaving((prev) => ({ ...prev, [id]: true }));
    try { await api.put(`/api/repositories/${id}`, body); toast({ title: "Updated", variant: "success" }); dispatch(fetchRepositories()); } catch { toast({ title: "Error", variant: "destructive" }); } finally { setSaving((prev) => ({ ...prev, [id]: false })); }
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">Configure SMTP and notification recipients per repository</p>
      {repos.map((repo) => (
        <Card key={String(repo.id)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{String(repo.name)}</CardTitle>
            {saving[String(repo.id)] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>SMTP Host</Label><Input defaultValue={String(repo.smtp_host || "")} onBlur={(e) => saveSmtp(String(repo.id), { smtp_host: e.target.value, smtp_port: Number(repo.smtp_port), smtp_user: String(repo.smtp_user), smtp_from_address: String(repo.smtp_from_address) })} disabled={saving[String(repo.id)]} /></div>
               <div className="space-y-2"><Label>SMTP Port</Label><Input type="number" defaultValue={String(repo.smtp_port || 587)} onBlur={(e) => saveSmtp(String(repo.id), { smtp_host: String(repo.smtp_host), smtp_port: Number(e.target.value), smtp_user: String(repo.smtp_user), smtp_from_address: String(repo.smtp_from_address) })} disabled={saving[String(repo.id)]} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>SMTP User</Label><Input defaultValue={String(repo.smtp_user || "")} onBlur={(e) => saveSmtp(String(repo.id), { smtp_host: String(repo.smtp_host), smtp_port: Number(repo.smtp_port), smtp_user: e.target.value, smtp_from_address: String(repo.smtp_from_address) })} disabled={saving[String(repo.id)]} /></div>
               <div className="space-y-2"><Label>From Address</Label><Input defaultValue={String(repo.smtp_from_address || "")} onBlur={(e) => saveSmtp(String(repo.id), { smtp_host: String(repo.smtp_host), smtp_port: Number(repo.smtp_port), smtp_user: String(repo.smtp_user), smtp_from_address: e.target.value })} disabled={saving[String(repo.id)]} /></div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Recipients (comma-separated)</Label>
              <Input defaultValue={String(repo.notification_recipients || "")} onBlur={(e) => updateRepo(String(repo.id), { notification_recipients: e.target.value })} disabled={saving[String(repo.id)]} />
            </div>
            <div className="flex items-center gap-4">
              <Label className="text-sm">Include Commit Author</Label>
              <Select defaultValue={Number(repo.include_commit_author) ? "on" : "off"} onValueChange={(v) => updateRepo(String(repo.id), { include_commit_author: v === "on" ? 1 : 0 })} disabled={saving[String(repo.id)]}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="on">On</SelectItem><SelectItem value="off">Off</SelectItem></SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
