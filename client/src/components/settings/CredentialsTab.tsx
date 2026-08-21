import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { Plus, Trash2, KeyRound, Loader2, Pencil, ShieldCheck } from "lucide-react";
import type { Credential } from "./types";
import { FieldError, hasErrors, validateEmail, validateRequired } from "./validation";
import { ListFilter, NoMatchesState } from "./ListFilter";

export function CredentialsTab({
  credentials,
  onRefresh,
  loading,
  onNavigateTab,
  hasRepositories,
}: {
  credentials: Credential[];
  onRefresh: () => void;
  loading?: boolean;
  onNavigateTab?: (tab: string) => void;
  hasRepositories?: boolean;
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
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCredentials = normalizedQuery
    ? credentials.filter((cred) =>
        [cred.username, cred.workspace || ""].some((field) => field.toLowerCase().includes(normalizedQuery))
      )
    : credentials;

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nextErrors: Record<string, string | undefined> = {
      username: validateEmail(String(fd.get("username") || "")),
      app_password: validateRequired(fd.get("app_password"), "API token"),
    };
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.post("/api/credentials", {
        username: fd.get("username"),
        app_password: fd.get("app_password"),
        workspace: fd.get("workspace"),
      });
      setDialogOpen(false);
      onRefresh();
      if (onNavigateTab && !hasRepositories) {
        toast({
          title: "Credential added",
          description: "Next: add a repository that uses this credential.",
          variant: "success",
          action: (
            <ToastAction altText="Go to repositories" onClick={() => onNavigateTab("repositories")}>
              Next: Add repository
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Credential added", variant: "success" });
      }
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
    setEditErrors({});
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTarget) return;
    const nextErrors: Record<string, string | undefined> = { username: validateEmail(editUsername) };
    if (hasErrors(nextErrors)) {
      setEditErrors(nextErrors);
      return;
    }
    setEditErrors({});
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
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setErrors({}); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Credential</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Credential</DialogTitle>
              <DialogDescription>Store an Atlassian email and API token for Bitbucket access.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-credential-email">Atlassian email</Label>
                <Input
                  id="add-credential-email"
                  name="username"
                  type="email"
                  autoComplete="email"
                  error={!!errors.username}
                  aria-describedby={errors.username ? "add-credential-email-error" : undefined}
                />
                <FieldError id="add-credential-email-error" message={errors.username} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-credential-token">API token</Label>
                <Input
                  id="add-credential-token"
                  name="app_password"
                  type="password"
                  autoComplete="new-password"
                  error={!!errors.app_password}
                  aria-describedby={errors.app_password ? "add-credential-token-error" : undefined}
                />
                <FieldError id="add-credential-token-error" message={errors.app_password} />
              </div>
              <div className="space-y-2"><Label htmlFor="add-credential-workspace">Workspace (optional)</Label><Input id="add-credential-workspace" name="workspace" /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {credentials.length > 0 && (
        <ListFilter
          label="Search credentials"
          placeholder="Search by email or workspace"
          value={query}
          onChange={setQuery}
          resultCount={filteredCredentials.length}
          totalCount={credentials.length}
        />
      )}

      {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loading && filteredCredentials.map((cred) => (
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
      {!loading && credentials.length > 0 && filteredCredentials.length === 0 && (
        <NoMatchesState query={query} entityLabel="credentials" onClear={() => setQuery("")} />
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Credential</DialogTitle>
            <DialogDescription>Update the credential. Leave the token blank to keep the current value.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-credential-email">Atlassian email</Label>
              <Input
                id="edit-credential-email"
                type="email"
                autoComplete="email"
                value={editUsername}
                onChange={(e) => {
                  setEditUsername(e.target.value);
                  if (editErrors.username) setEditErrors((prev) => ({ ...prev, username: undefined }));
                }}
                error={!!editErrors.username}
                aria-describedby={editErrors.username ? "edit-credential-email-error" : undefined}
              />
              <FieldError id="edit-credential-email-error" message={editErrors.username} />
            </div>
            <div className="space-y-2"><Label htmlFor="edit-credential-token">New API token (optional)</Label><Input id="edit-credential-token" type="password" autoComplete="new-password" value={editToken} onChange={(e) => setEditToken(e.target.value)} placeholder="Leave blank to keep current token" /></div>
            <div className="space-y-2"><Label htmlFor="edit-credential-workspace">Workspace (optional)</Label><Input id="edit-credential-workspace" value={editWorkspace} onChange={(e) => setEditWorkspace(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Credential</DialogTitle>
            <DialogDescription>
              Delete the credential for <span className="font-medium text-foreground">{deleteTarget?.username}</span>? Credentials assigned to repositories cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={!!deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget.id)} disabled={!!deleting}>{deleting ? "Deleting..." : "Delete Credential"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
