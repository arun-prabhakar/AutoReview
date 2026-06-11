import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { fetchSettings } from "@/store/settingsSlice";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail } from "lucide-react";

export function NotificationsTab() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { smtp } = useSelector((state: RootState) => state.settings);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [savingRepo, setSavingRepo] = useState<Record<string, boolean>>({});
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_address: "",
  });

  useEffect(() => {
    if (smtp) {
      setSmtpForm({
        smtp_host: smtp.smtp_host || "",
        smtp_port: String(smtp.smtp_port ?? 587),
        smtp_user: smtp.smtp_user || "",
        smtp_password: "",
        smtp_from_address: smtp.smtp_from_address || "",
      });
    }
  }, [smtp]);

  const saveSmtp = async () => {
    setSaving(true);
    try {
      await api.put("/api/settings/smtp", smtpForm);
      toast({ title: "SMTP settings saved", variant: "success" });
      dispatch(fetchSettings());
    } catch {
      toast({ title: "Failed to save SMTP settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateRepo = async (id: string, body: Record<string, unknown>) => {
    setSavingRepo((prev) => ({ ...prev, [id]: true }));
    try {
      await api.put(`/api/repositories/${id}`, body);
      toast({ title: "Updated", variant: "success" });
      dispatch(fetchRepositories());
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSavingRepo((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">SMTP Configuration</CardTitle>
          </div>
          {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Global SMTP settings used by all repositories for sending review notifications.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input
                value={smtpForm.smtp_host}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))}
                onBlur={saveSmtp}
                disabled={saving}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP Port</Label>
              <Input
                type="number"
                value={smtpForm.smtp_port}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: e.target.value }))}
                onBlur={saveSmtp}
                disabled={saving}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP User</Label>
              <Input
                value={smtpForm.smtp_user}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))}
                onBlur={saveSmtp}
                disabled={saving}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>SMTP Password</Label>
              <Input
                type="password"
                value={smtpForm.smtp_password}
                onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_password: e.target.value }))}
                onBlur={saveSmtp}
                disabled={saving}
                placeholder={smtp?.smtp_user ? "Leave blank to keep current" : ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>From Address</Label>
            <Input
              value={smtpForm.smtp_from_address}
              onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from_address: e.target.value }))}
              onBlur={saveSmtp}
              disabled={saving}
              placeholder="autoreview@example.com"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <p className="text-sm text-muted-foreground">Per-repository notification settings</p>
      {repos.map((repo) => (
        <Card key={String(repo.id)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{String(repo.name)}</CardTitle>
            {savingRepo[String(repo.id)] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Recipients (comma-separated)</Label>
              <Input defaultValue={String(repo.notification_recipients || "")} onBlur={(e) => updateRepo(String(repo.id), { notification_recipients: e.target.value })} disabled={savingRepo[String(repo.id)]} />
            </div>
            <div className="flex items-center gap-4">
              <Label className="text-sm">Include Commit Author</Label>
              <Select defaultValue={Number(repo.include_commit_author) ? "on" : "off"} onValueChange={(v) => updateRepo(String(repo.id), { include_commit_author: v === "on" ? 1 : 0 })} disabled={savingRepo[String(repo.id)]}>
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
