import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, KeyRound, Loader2 } from "lucide-react";
import type { Credential } from "./types";

export function CredentialsTab({
  credentials,
  onRefresh,
}: {
  credentials: Credential[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/credentials", {
        username: fd.get("username"),
        app_password: fd.get("app_password"),
        workspace: fd.get("workspace"),
      });
      toast({ title: "Credential added", variant: "success" });
      setDialogOpen(false);
      onRefresh();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add credential", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { await api.del(`/api/credentials/${id}`); toast({ title: "Credential deleted", variant: "success" }); onRefresh(); } catch {} finally { setDeleting(null); }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Bitbucket Cloud credentials</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Credential</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Credential</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2"><Label>Username</Label><Input name="username" required /></div>
              <div className="space-y-2"><Label>App Password</Label><Input name="app_password" type="password" required /></div>
              <div className="space-y-2"><Label>Workspace (optional)</Label><Input name="workspace" /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {credentials.map((cred) => (
        <Card key={cred.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{cred.username}</p>
              <p className="text-sm text-muted-foreground">{cred.workspace || "No workspace"}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Delete credential" disabled={deleting === cred.id} onClick={() => handleDelete(cred.id)}>{deleting === cred.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}</Button>
          </CardContent>
        </Card>
      ))}
      {credentials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <KeyRound className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No credentials configured</p>
          <p className="text-xs text-muted-foreground mb-4">Add your Bitbucket Cloud credentials to connect repositories.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first credential</Button>
        </div>
      )}
    </>
  );
}
