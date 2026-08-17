import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, KeyRound, Loader2, Pencil, ShieldCheck } from "lucide-react";
import type { Credential } from "./types";

export function CredentialsTab({
  credentials,
  onRefresh,
  loading,
}: {
  credentials: Credential[];
  onRefresh: () => void;
  loading?: boolean;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [editTarget, setEditTarget] = useState<Credential | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editWorkspace, setEditWorkspace] = useState("");
  const [editToken, setEditToken] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

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

  const openEdit = (credential: Credential) => {
    setEditTarget(credential);
    setEditUsername(credential.username);
    setEditWorkspace(credential.workspace || "");
    setEditToken("");
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.put(`/api/credentials/${editTarget.id}`, {
        username: editUsername,
        workspace: editWorkspace,
        app_password: editToken || undefined,
      });
      toast({ title: "Credential updated", variant: "success" });
      setEditTarget(null);
      onRefresh();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Failed to update credential", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.del(`/api/credentials/${id}`);
      toast({ title: "Credential deleted", variant: "success" });
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      toast({
        title: "Cannot delete credential",
        description: err instanceof Error ? err.message : "The credential may be in use by a repository.",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleTest = async (credential: Credential) => {
    setTesting(credential.id);
    try {
      const result = await api.post<{ repository: string; openPullRequests: number }>(`/api/credentials/${credential.id}/test`, {});
      toast({ title: "Credential verified", description: `${result.repository}: access confirmed (${result.openPullRequests} open PRs).`, variant: "success" });
    } catch (err) {
      toast({ title: "Credential test failed", description: err instanceof Error ? err.message : "Bitbucket access could not be verified", variant: "destructive" });
    } finally {
      setTesting(null);
    }
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
              <div className="space-y-2"><Label>Atlassian email</Label><Input name="username" type="email" autoComplete="email" required /></div>
              <div className="space-y-2"><Label>API token</Label><Input name="app_password" type="password" autoComplete="new-password" required /></div>
              <div className="space-y-2"><Label>Workspace (optional)</Label><Input name="workspace" /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loading && credentials.map((cred) => (
        <Card key={cred.id}>
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div className="min-w-0">
              <p className="font-medium break-all">{cred.username}</p>
              <p className="text-sm text-muted-foreground break-all">{cred.workspace || "No workspace"}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Test credential" disabled={testing === cred.id} onClick={() => handleTest(cred)}>{testing === cred.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}</Button>
              <Button variant="ghost" size="icon" aria-label="Edit credential" onClick={() => openEdit(cred)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete credential" disabled={deleting === cred.id} onClick={() => setDeleteTarget(cred)}>{deleting === cred.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!loading && credentials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <KeyRound className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No credentials configured</p>
          <p className="text-xs text-muted-foreground mb-4">Add your Bitbucket Cloud credentials to connect repositories.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first credential</Button>
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Credential</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2"><Label>Atlassian email</Label><Input type="email" autoComplete="email" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} required /></div>
            <div className="space-y-2"><Label>New API token (optional)</Label><Input type="password" autoComplete="new-password" value={editToken} onChange={(e) => setEditToken(e.target.value)} placeholder="Leave blank to keep current token" /></div>
            <div className="space-y-2"><Label>Workspace (optional)</Label><Input value={editWorkspace} onChange={(e) => setEditWorkspace(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-destructive">Delete Credential</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete the credential for <span className="font-medium text-foreground">{deleteTarget?.username}</span>? Credentials assigned to repositories cannot be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={!!deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget.id)} disabled={!!deleting}>{deleting ? "Deleting..." : "Delete Credential"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
