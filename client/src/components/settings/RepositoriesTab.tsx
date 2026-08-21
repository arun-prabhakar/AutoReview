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
import { ToastAction } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FolderGit2, Loader2, Pencil, Layers } from "lucide-react";
import type { Credential } from "@/types";
import { FieldError, hasErrors, validateRequiredValue } from "./validation";
import { ListFilter, NoMatchesState } from "./ListFilter";

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

export function RepositoriesTab({
  credentials,
  loadingCredentials: _loadingCredentials,
  onNavigateTab,
  hasProviders,
}: {
  credentials: Credential[];
  loadingCredentials?: boolean;
  onNavigateTab?: (tab: string) => void;
  hasProviders?: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos, loading: loadingRepos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [parsedRepo, setParsedRepo] = useState<{ workspace: string; slug: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; credential_id: string; multi_pass_review: boolean } | null>(null);
  const [editName, setEditName] = useState("");
  const [editCredentialId, setEditCredentialId] = useState("");
  const [editMultiPass, setEditMultiPass] = useState(false);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRepos = normalizedQuery
    ? repos.filter((repo) =>
        [String(repo.name), String(repo.workspace), String(repo.slug)].some((field) =>
          field.toLowerCase().includes(normalizedQuery)
        )
      )
    : repos;

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseBitbucketUrl(repoUrl);
    const nextErrors: Record<string, string | undefined> = {};
    if (!repoUrl.trim()) {
      nextErrors.repoUrl = "Repository URL is required.";
    } else if (!parsed) {
      nextErrors.repoUrl = "Enter a valid Bitbucket URL, e.g. https://bitbucket.org/workspace/repo-slug";
    }
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const workspace = parsed?.workspace;
    const slug = parsed?.slug;
    try {
      await api.post("/api/repositories", {
        name: fd.get("name") || slug, slug, workspace,
        credential_id: fd.get("credential_id"),
      });
      setDialogOpen(false);
      setRepoUrl("");
      setParsedRepo(null);
      dispatch(fetchRepositories());
      if (onNavigateTab && hasProviders && credentials.length > 0) {
        toast({
          title: "Repository added",
          description: "Setup complete. Configure how reviews run for it next.",
          variant: "success",
          action: (
            <ToastAction altText="Go to review configuration" onClick={() => onNavigateTab("review")}>
              Next: Configure review
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Repository added", variant: "success" });
      }
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
    const nextErrors: Record<string, string | undefined> = { name: validateRequiredValue(editName, "Name") };
    if (hasErrors(nextErrors)) {
      setEditErrors(nextErrors);
      return;
    }
    setEditErrors({});
    setSaving(true);
    try {
      await api.put(`/api/repositories/${editTarget.id}`, { name: editName, credential_id: editCredentialId, multi_pass_review: editMultiPass });
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
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setRepoUrl(""); setParsedRepo(null); setErrors({}); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Repository</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Repository</DialogTitle>
              <DialogDescription>Paste a Bitbucket repository URL to connect it for reviews.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-repo-url">Repository URL</Label>
                <Input
                  id="add-repo-url"
                  inputMode="url"
                  placeholder="https://bitbucket.org/workspace/repo-slug"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    setParsedRepo(parseBitbucketUrl(e.target.value));
                    if (errors.repoUrl) setErrors((prev) => ({ ...prev, repoUrl: undefined }));
                  }}
                  error={!!errors.repoUrl}
                  aria-describedby={errors.repoUrl ? "add-repo-url-error" : undefined}
                />
                {parsedRepo && (
                  <p className="text-xs text-muted-foreground">
                    Workspace: <span className="font-mono text-foreground">{parsedRepo.workspace}</span> · Slug: <span className="font-mono text-foreground">{parsedRepo.slug}</span>
                  </p>
                )}
                <FieldError id="add-repo-url-error" message={errors.repoUrl} />
              </div>
              <div className="space-y-2"><Label htmlFor="add-repo-name">Name</Label><Input id="add-repo-name" key={parsedRepo?.slug} name="name" placeholder={parsedRepo?.slug || "Repository name"} defaultValue={parsedRepo?.slug || ""} /></div>
              <div className="space-y-2">
                <Label>Credential</Label>
                <Select name="credential_id">
                  <SelectTrigger><SelectValue placeholder="Select credential" /></SelectTrigger>
                  <SelectContent>{credentials.map((c) => <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>)}</SelectContent>
                </Select>
                {credentials.length === 0 && <p className="text-xs text-warning">Add a credential first (see Credentials tab).</p>}
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Add Repository"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {repos.length > 0 && (
        <ListFilter
          label="Search repositories"
          placeholder="Search by name, workspace or slug"
          value={query}
          onChange={setQuery}
          resultCount={filteredRepos.length}
          totalCount={repos.length}
        />
      )}

      {loadingRepos && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loadingRepos && filteredRepos.map((repo) => (
        <Card key={String(repo.id)}>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium break-words">{String(repo.name)}</p>
              <p className="text-sm text-muted-foreground font-mono break-all">{String(repo.workspace)}/{String(repo.slug)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{String(repo.review_mode)}</Badge>
              {repo.multi_pass_review ? (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
                  <Layers className="h-3 w-3" />Multi-Pass
                </Badge>
              ) : null}
              <Button variant="ghost" size="icon" aria-label="Edit repository" onClick={() => { setEditTarget({ id: String(repo.id), name: String(repo.name), credential_id: String(repo.credential_id), multi_pass_review: !!repo.multi_pass_review }); setEditName(String(repo.name)); setEditCredentialId(String(repo.credential_id)); setEditMultiPass(!!repo.multi_pass_review); setEditErrors({}); }}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete repository" onClick={() => setDeleteTarget({ id: String(repo.id), name: String(repo.name) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!loadingRepos && repos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderGit2 className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No repositories configured</p>
          <p className="text-xs text-muted-foreground mb-4">Add a Bitbucket repository to start reviewing code.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first repository</Button>
        </div>
      )}
      {!loadingRepos && repos.length > 0 && filteredRepos.length === 0 && (
        <NoMatchesState query={query} entityLabel="repositories" onClear={() => setQuery("")} />
      )}

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Repository</DialogTitle>
            <DialogDescription>Update the repository name, credential, and review mode.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-repo-name">Name</Label>
              <Input
                id="edit-repo-name"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: undefined }));
                }}
                error={!!editErrors.name}
                aria-describedby={editErrors.name ? "edit-repo-name-error" : undefined}
              />
              <FieldError id="edit-repo-name-error" message={editErrors.name} />
            </div>
            <div className="space-y-2">
              <Label>Credential</Label>
              <Select value={editCredentialId} onValueChange={setEditCredentialId}>
                <SelectTrigger><SelectValue placeholder="Select credential" /></SelectTrigger>
                <SelectContent>{credentials.map((c) => <SelectItem key={c.id} value={c.id}>{c.username}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Multi-Pass Review</Label>
                <p className="text-xs text-muted-foreground">Run specialized security, performance &amp; maintainability passes</p>
              </div>
              <input
                type="checkbox"
                checked={editMultiPass}
                onChange={(e) => setEditMultiPass(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
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
