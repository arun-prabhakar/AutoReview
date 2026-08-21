import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { Plus, Trash2, Pencil, Cpu, Loader2, Zap } from "lucide-react";
import type { Provider } from "./types";
import { PROVIDER_PRESETS } from "./types";
import { FieldError, hasErrors, validateHttpUrl, validateRequired } from "./validation";
import { ListFilter, NoMatchesState } from "./ListFilter";

const BEDROCK_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
];

export function ProvidersTab({
  providers,
  onRefresh,
  loading,
  onNavigateTab,
  hasCredentials,
  hasRepositories,
}: {
  providers: Provider[];
  onRefresh: () => void;
  loading?: boolean;
  onNavigateTab?: (tab: string) => void;
  hasCredentials?: boolean;
  hasRepositories?: boolean;
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
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1");
  const [editBedrockRegion, setEditBedrockRegion] = useState("us-east-1");
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProviders = normalizedQuery
    ? providers.filter((p) =>
        [p.name, p.api_base, p.provider_type === "aws_bedrock" ? "aws bedrock" : p.provider_type, p.aws_region || ""].some((field) =>
          field.toLowerCase().includes(normalizedQuery)
        )
      )
    : providers;

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

  const announceNextStep = () => {
    if (!onNavigateTab) {
      toast({ title: "Provider added", variant: "success" });
      return;
    }
    if (!hasCredentials) {
      toast({
        title: "Provider added",
        description: "Next: connect a Bitbucket credential to link repositories.",
        variant: "success",
        action: (
          <ToastAction altText="Go to credentials" onClick={() => onNavigateTab("credentials")}>
            Next: Connect a credential
          </ToastAction>
        ),
      });
      return;
    }
    if (!hasRepositories) {
      toast({
        title: "Provider added",
        description: "Next: add a repository to review.",
        variant: "success",
        action: (
          <ToastAction altText="Go to repositories" onClick={() => onNavigateTab("repositories")}>
            Next: Add repository
          </ToastAction>
        ),
      });
      return;
    }
    toast({ title: "Provider added", variant: "success" });
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const isBedrock = providerPreset === "bedrock";
    const nextErrors: Record<string, string | undefined> = {
      name: validateRequired(fd.get("name"), "Name"),
    };
    if (isBedrock) {
      nextErrors.access_key_id = validateRequired(fd.get("access_key_id"), "Access Key ID");
      nextErrors.secret_access_key = validateRequired(fd.get("secret_access_key"), "Secret Access Key");
    } else {
      nextErrors.api_base = validateHttpUrl(fd.get("api_base"), "API Base URL");
      nextErrors.api_key = validateRequired(fd.get("api_key"), "API Key");
    }
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const body: Record<string, string> = {
        name: fd.get("name") as string,
        provider_type: isBedrock ? "aws_bedrock" : "openai_compatible",
      };

      if (isBedrock) {
        body.api_base = "aws-bedrock";
        body.aws_region = bedrockRegion;
        body.api_key = JSON.stringify({
          accessKeyId: fd.get("access_key_id") as string,
          secretAccessKey: fd.get("secret_access_key") as string,
        });
      } else {
        body.api_base = fd.get("api_base") as string;
        body.api_key = fd.get("api_key") as string;
      }

      await api.post("/api/providers", body);
      setDialogOpen(false);
      setProviderPreset("custom");
      setBedrockRegion("us-east-1");
      onRefresh();
      announceNextStep();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add provider", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProvider) return;
    const fd = new FormData(e.currentTarget);
    const isBedrock = editingProvider.provider_type === "aws_bedrock" || editProviderPreset === "bedrock";
    const nextErrors: Record<string, string | undefined> = {
      name: validateRequired(fd.get("name"), "Name"),
    };
    if (!isBedrock) {
      nextErrors.api_base = validateHttpUrl(fd.get("api_base"), "API Base URL");
    }
    if (hasErrors(nextErrors)) {
      setEditErrors(nextErrors);
      return;
    }
    setEditErrors({});
    setEditing(true);
    try {
      const body: Record<string, string> = {
        name: fd.get("name") as string,
        provider_type: isBedrock ? "aws_bedrock" : "openai_compatible",
      };

      if (isBedrock) {
        body.api_base = "aws-bedrock";
        body.aws_region = editBedrockRegion;
        const accessKeyId = fd.get("access_key_id") as string;
        const secretAccessKey = fd.get("secret_access_key") as string;
        if (accessKeyId || secretAccessKey) {
          body.api_key = JSON.stringify({
            accessKeyId: accessKeyId || "",
            secretAccessKey: secretAccessKey || "",
          });
        }
      } else {
        body.api_base = fd.get("api_base") as string;
        const apiKey = fd.get("api_key") as string;
        if (apiKey) body.api_key = apiKey;
      }

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

  const getProviderPresetForEdit = (p: Provider) => {
    if (p.provider_type === "aws_bedrock") return "bedrock";
    return "custom";
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">LLM providers (OpenAI-compatible &amp; AWS Bedrock)</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setProviderPreset("custom"); setBedrockRegion("us-east-1"); setErrors({}); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Provider</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add LLM Provider</DialogTitle>
              <DialogDescription>Connect an OpenAI-compatible endpoint or AWS Bedrock.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Select value={providerPreset} onValueChange={(v) => { setProviderPreset(v); setErrors({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-provider-name">Name</Label>
                <Input
                  id="add-provider-name"
                  key={providerPreset}
                  name="name"
                  error={!!errors.name}
                  aria-describedby={errors.name ? "add-provider-name-error" : undefined}
                  placeholder={PROVIDER_PRESETS[providerPreset]?.label || "Provider name"}
                  defaultValue={PROVIDER_PRESETS[providerPreset]?.label}
                />
                <FieldError id="add-provider-name-error" message={errors.name} />
              </div>
              {providerPreset === "bedrock" ? (
                <>
                  <div className="space-y-2">
                    <Label>AWS Region</Label>
                    <Select value={bedrockRegion} onValueChange={setBedrockRegion}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BEDROCK_REGIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-provider-access-key">Access Key ID</Label>
                    <Input
                      id="add-provider-access-key"
                      name="access_key_id"
                      type="password"
                      error={!!errors.access_key_id}
                      aria-describedby={errors.access_key_id ? "add-provider-access-key-error" : undefined}
                    />
                    <FieldError id="add-provider-access-key-error" message={errors.access_key_id} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-provider-secret-key">Secret Access Key</Label>
                    <Input
                      id="add-provider-secret-key"
                      name="secret_access_key"
                      type="password"
                      error={!!errors.secret_access_key}
                      aria-describedby={errors.secret_access_key ? "add-provider-secret-key-error" : undefined}
                    />
                    <FieldError id="add-provider-secret-key-error" message={errors.secret_access_key} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="add-provider-api-base">API Base URL</Label>
                    <Input
                      id="add-provider-api-base"
                      name="api_base"
                      inputMode="url"
                      error={!!errors.api_base}
                      aria-describedby={errors.api_base ? "add-provider-api-base-error" : undefined}
                      placeholder="https://api.openai.com/v1"
                      defaultValue={PROVIDER_PRESETS[providerPreset]?.apiBase || ""}
                    />
                    <FieldError id="add-provider-api-base-error" message={errors.api_base} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-provider-api-key">API Key</Label>
                    <Input
                      id="add-provider-api-key"
                      name="api_key"
                      type="password"
                      error={!!errors.api_key}
                      aria-describedby={errors.api_key ? "add-provider-api-key-error" : undefined}
                    />
                    <FieldError id="add-provider-api-key-error" message={errors.api_key} />
                  </div>
                </>
              )}
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {providers.length > 0 && (
        <ListFilter
          label="Search providers"
          placeholder="Search by name, base URL or type"
          value={query}
          onChange={setQuery}
          resultCount={filteredProviders.length}
          totalCount={providers.length}
        />
      )}

      {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loading && filteredProviders.map((p) => (
        <Card key={p.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div className="min-w-0">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground font-mono break-all">
                {p.provider_type === "aws_bedrock" ? `AWS Bedrock — ${p.aws_region || "us-east-1"}` : p.api_base}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Test connection" onClick={() => handleTest(p)} disabled={testing === p.id}>
                {testing === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Edit provider" onClick={() => { const preset = getProviderPresetForEdit(p); setEditProviderPreset(preset); setEditBedrockRegion(p.aws_region || "us-east-1"); setEditErrors({}); setEditingProvider(p); }}><Pencil className="h-4 w-4" /></Button>
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
      {!loading && providers.length > 0 && filteredProviders.length === 0 && (
        <NoMatchesState query={query} entityLabel="providers" onClear={() => setQuery("")} />
      )}

      <Dialog open={!!editingProvider} onOpenChange={(o) => { if (!o) { setEditingProvider(null); setEditProviderPreset("custom"); setEditBedrockRegion("us-east-1"); setEditErrors({}); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
            <DialogDescription>Update provider details. Secrets can be left blank to keep the current value.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select value={editProviderPreset} onValueChange={(v) => { setEditProviderPreset(v); setEditErrors({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-provider-name">Name</Label>
              <Input
                id="edit-provider-name"
                name="name"
                error={!!editErrors.name}
                aria-describedby={editErrors.name ? "edit-provider-name-error" : undefined}
                defaultValue={editingProvider?.name}
              />
              <FieldError id="edit-provider-name-error" message={editErrors.name} />
            </div>
            {editProviderPreset === "bedrock" ? (
              <>
                <div className="space-y-2">
                  <Label>AWS Region</Label>
                  <Select value={editBedrockRegion} onValueChange={setEditBedrockRegion}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BEDROCK_REGIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="edit-provider-access-key">Access Key ID</Label><Input id="edit-provider-access-key" name="access_key_id" type="password" placeholder="Leave blank to keep current" /></div>
                <div className="space-y-2"><Label htmlFor="edit-provider-secret-key">Secret Access Key</Label><Input id="edit-provider-secret-key" name="secret_access_key" type="password" placeholder="Leave blank to keep current" /></div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-provider-api-base">API Base URL</Label>
                  <Input
                    id="edit-provider-api-base"
                    name="api_base"
                    inputMode="url"
                    error={!!editErrors.api_base}
                    aria-describedby={editErrors.api_base ? "edit-provider-api-base-error" : undefined}
                    defaultValue={editingProvider?.api_base}
                    placeholder={PROVIDER_PRESETS[editProviderPreset]?.apiBase || "https://..."}
                  />
                  <FieldError id="edit-provider-api-base-error" message={editErrors.api_base} />
                </div>
                <div className="space-y-2"><Label htmlFor="edit-provider-api-key">API Key</Label><Input id="edit-provider-api-key" name="api_key" type="password" placeholder="Leave blank to keep current key" /></div>
              </>
            )}
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
