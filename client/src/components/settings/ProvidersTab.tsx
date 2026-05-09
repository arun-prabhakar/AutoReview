import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Cpu, Loader2, Zap } from "lucide-react";
import type { Provider } from "./types";
import { PROVIDER_PRESETS, detectProviderPreset } from "./types";

export function ProvidersTab({
  providers,
  onRefresh,
  loading,
}: {
  providers: Provider[];
  onRefresh: () => void;
  loading?: boolean;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerPreset, setProviderPreset] = useState("custom");
  const [editProviderPreset, setEditProviderPreset] = useState("custom");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const handleTest = async (provider: Provider) => {
    setTesting(provider.id);
    try {
      const result = await api.post<{ success: boolean; error?: string }>(`/api/providers/${provider.id}/test`, {});
      if (result.success) {
        toast({ title: "Connection successful", description: `${provider.name} is reachable.`, variant: "success" });
      }
    } catch (err) {
      toast({ title: "Connection failed", description: err instanceof Error ? err.message : "Could not reach provider", variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/providers", {
        name: fd.get("name"),
        api_base: fd.get("api_base"),
        api_key: fd.get("api_key"),
      });
      toast({ title: "Provider added", variant: "success" });
      setDialogOpen(false);
      setProviderPreset("custom");
      onRefresh();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add provider", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProvider) return;
    setEditing(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = { name: fd.get("name") as string, api_base: fd.get("api_base") as string };
    const apiKey = fd.get("api_key") as string;
    if (apiKey) body.api_key = apiKey;
    try {
      await api.put(`/api/providers/${editingProvider.id}`, body);
      toast({ title: "Provider updated", variant: "success" });
      setEditingProvider(null);
      onRefresh();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update provider", variant: "destructive" });
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteInProgress(true);
    try {
      await api.del(`/api/providers/${deleteTarget.id}`);
      toast({ title: "Provider deleted", variant: "success" });
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeleteInProgress(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">OpenAI-compatible LLM providers</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setProviderPreset("custom"); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Provider</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add LLM Provider</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Select value={providerPreset} onValueChange={setProviderPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Name</Label><Input name="name" required placeholder={PROVIDER_PRESETS[providerPreset]?.label || "Provider name"} defaultValue={PROVIDER_PRESETS[providerPreset]?.label} /></div>
              <div className="space-y-2"><Label>API Base URL</Label><Input name="api_base" required placeholder="https://api.openai.com/v1" defaultValue={PROVIDER_PRESETS[providerPreset]?.apiBase || ""} /></div>
              <div className="space-y-2"><Label>API Key</Label><Input name="api_key" type="password" required /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loading && providers.map((p) => (
        <Card key={p.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground font-mono">{p.api_base}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Test connection" onClick={() => handleTest(p)} disabled={testing === p.id}>
                {testing === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Edit provider" onClick={() => { setEditProviderPreset(detectProviderPreset(p.api_base)); setEditingProvider(p); }}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete provider" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!loading && providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Cpu className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No providers configured</p>
          <p className="text-xs text-muted-foreground mb-4">Add an LLM provider to start using AI-powered reviews.</p>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Provider</Button>
        </div>
      )}

      <Dialog open={!!editingProvider} onOpenChange={(o) => { if (!o) { setEditingProvider(null); setEditProviderPreset("custom"); } else if (editingProvider) { setEditProviderPreset(detectProviderPreset(editingProvider.api_base)); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select value={editProviderPreset} onValueChange={setEditProviderPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Name</Label><Input name="name" required defaultValue={editingProvider?.name} /></div>
            <div className="space-y-2"><Label>API Base URL</Label><Input name="api_base" required defaultValue={editingProvider?.api_base} placeholder={PROVIDER_PRESETS[editProviderPreset]?.apiBase || "https://..."} /></div>
            <div className="space-y-2"><Label>API Key</Label><Input name="api_key" type="password" placeholder="Leave blank to keep current key" /></div>
            <Button type="submit" className="w-full" disabled={editing}>{editing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Saving..." : "Update"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Provider
            </DialogTitle>
            <DialogDescription className="pt-1">
              Permanently delete provider{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteInProgress}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteInProgress}>
              {deleteInProgress ? "Deleting…" : "Delete Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
