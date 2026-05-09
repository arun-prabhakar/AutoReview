import { useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import type { RootState } from "@/store";
import { useSelector } from "react-redux";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FolderGit2, Loader2, Pencil } from "lucide-react";
import type { Credential } from "@/types";

function parseBitbucketUrl(url: string): { workspace: string; slug: string } | null {
  try {
    const patterns = [
      /bitbucket\.org\/([^/]+)\/([^/]+)/,
      /api\.bitbucket\.org\/2\.0\/repositories\/([^/]+)\/([^/]+)/,
    ];
    for (const pat of patterns) {
      const m = url.match(pat);
      if (m && m[1] && m[2]) return { workspace: m[1], slug: m[2].replace(/\.git$/, "") };
    }
  } catch {
    return null;
  }
  return null;
}

export function RepositoriesTab({ credentials }: { credentials: Credential[] }) {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [parsedRepo, setParsedRepo] = useState<{ workspace: string; slug: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; credential_id: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editCredentialId, setEditCredentialId] = useState("");

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const parsed = parseBitbucketUrl(repoUrl);
    const workspace = parsed?.workspace || fd.get("workspace");
    const slug = parsed?.slug || fd.get("slug");
    if (!workspace || !slug) {
      toast({ title: "Error", description: "Could not parse repository URL. Enter a valid Bitbucket URL", variant: "destructive" });
      setSaving(false);
      return;
    }
    try {
      await api.post("/api/repositories", {
        name: fd.get("name") || slug, slug, workspace,
        credential_id: fd.get("credential_id"),
      });
      toast({ title: "Repository added", variant: "success" });
      setDialogOpen(false);
      setRepoUrl("");
      setParsedRepo(null);
      dispatch(fetchRepositories());
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add repository", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteInProgress(true);
    try {
      await api.del(`/api/repositories/${deleteTarget.id}`);
      toast({ title: "Repository deleted", variant: "success" });
      setDeleteTarget(null);
      dispatch(fetchRepositories());
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleteInProgress(false);
    }
  };

  const handleEditRepo = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.put(`/api/repositories/${editTarget.id}`, { name: editName, credential_id: editCredentialId });
      toast({ title: "Repository updated", variant: "success" });
      setEditTarget(null);
      dispatch(fetchRepositories());
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update repository", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Connected repositories</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setRepoUrl(""); setParsedRepo(null); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Repository</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Repository</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Repository URL</Label>
                <Input
                  required
                  placeholder="https://bitbucket.org/workspace/repo-slug"
                  value={repoUrl}
                  onChange={(e) => { setRepoUrl(e.target.value); setParsedRepo(parseBitbucketUrl(e.target.value)); }}
                />
                {parsedRepo && (
                  <p className="text-xs text-muted-foreground">
                    Workspace: <span className="font-mono text-foreground">{parsedRepo.workspace}</span> · Slug: <span className="font-mono text-foreground">{parsedRepo.slug}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2"><Label>Name</Label><Input key={parsedRepo?.slug} name="name" placeholder={parsedRepo?.slug || "Repository name"} defaultValue={parsedRepo?.slug || ""} /></div>
              <div className="space-y-2"><Label>Credential</Label>
                <Select name="credential_id">
                  <SelectTrigger><SelectValue placeholder="Select credential" /></SelectTrigger>
                  <SelectContent>{credentials.map((c) => <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Add Repository"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {repos.map((repo) => (
        <Card key={String(repo.id)}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{String(repo.name)}</p>
              <p className="text-sm text-muted-foreground font-mono">{String(repo.workspace)}/{String(repo.slug)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{String(repo.review_mode)}</Badge>
              <Button variant="ghost" size="icon" aria-label="Edit repository" onClick={() => { setEditTarget({ id: String(repo.id), name: String(repo.name), credential_id: String(repo.credential_id) }); setEditName(String(repo.name)); setEditCredentialId(String(repo.credential_id)); }}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete repository" onClick={() => setDeleteTarget({ id: String(repo.id), name: String(repo.name) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {repos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderGit2 className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No repositories configured</p>
          <p className="text-xs text-muted-foreground mb-4">Add a Bitbucket repository to start reviewing code.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first repository</Button>
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Repository</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Credential</Label>
              <Select value={editCredentialId} onValueChange={setEditCredentialId}>
                <SelectTrigger><SelectValue placeholder="Select credential" /></SelectTrigger>
                <SelectContent>{credentials.map((c) => <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditRepo} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Repository
            </DialogTitle>
            <DialogDescription className="pt-1">
              Permanently delete repository{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteInProgress}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteInProgress}>
              {deleteInProgress ? "Deleting…" : "Delete Repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
