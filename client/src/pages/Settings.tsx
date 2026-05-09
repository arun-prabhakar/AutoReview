import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { type RootState, type AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";

const PROVIDER_PRESETS: Record<string, { label: string; apiBase: string; models: string[] }> = {
  openai: { label: "OpenAI", apiBase: "https://api.openai.com/v1", models: ["gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"] },
  anthropic: { label: "Anthropic", apiBase: "https://api.anthropic.com/v1", models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] },
  gemini: { label: "Google Gemini", apiBase: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-2.0-flash-lite"] },
  zai: { label: "ZAI", apiBase: "https://api.z.ai/api/coding/paas/v4", models: ["glm-5.1", "glm-4-plus", "glm-4-flash", "glm-4-air"] },
  custom: { label: "Custom", apiBase: "", models: [] },
};

function detectProviderPreset(apiBase: string): string {
  const base = apiBase.toLowerCase().replace(/\/+$/, "");
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (key === "custom") continue;
    if (base === preset.apiBase.toLowerCase().replace(/\/+$/, "")) return key;
  }
  // Partial match fallback
  if (base.includes("openai.com")) return "openai";
  if (base.includes("anthropic.com")) return "anthropic";
  if (base.includes("googleapis") || base.includes("generativelanguage")) return "gemini";
  if (base.includes("z.ai")) return "zai";
  return "custom";
}

type Credential = { id: string; username: string; workspace: string | null; created_at: string };
type Provider = { id: string; name: string; api_base: string; created_at: string };
type Repository = Record<string, unknown>;
type Template = { id: string; name: string; content: string; strictness: string; is_default: number; updated_at: string };

function parseBitbucketUrl(url: string): { workspace: string; slug: string } | null {
  try {
    const patterns = [
      /bitbucket\.org\/([^/]+)\/([^/]+)/,
      /api\.bitbucket\.org\/2\.0\/repositories\/([^/]+)\/([^/]+)/,
    ];
    for (const pat of patterns) {
      const m = url.match(pat);
      if (m) return { workspace: m[1], slug: m[2].replace(/\.git$/, "") };
    }
  } catch {}
  return null;
}

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeStrictness, setActiveStrictness] = useState("all");
  const [editorContent, setEditorContent] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [enhanceExpanded, setEnhanceExpanded] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState("");
  const [fixedOutputFormat, setFixedOutputFormat] = useState("");
  const [providerPreset, setProviderPreset] = useState("custom");
  const [editProviderPreset, setEditProviderPreset] = useState("custom");
  const [repoUrl, setRepoUrl] = useState("");
  const [parsedRepo, setParsedRepo] = useState<{ workspace: string; slug: string } | null>(null);
  const [testingRepo, setTestingRepo] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});

  useEffect(() => {
    dispatch(fetchRepositories());
    loadCredentials();
    loadProviders();
    loadTemplates();
    api.get<{ content: string }>("/api/settings/prompt-template/fixed-output-format")
      .then((d) => setFixedOutputFormat(d.content))
      .catch(() => {});
  }, [dispatch]);

  const loadCredentials = async () => {
    try {
      const data = await api.get<Credential[]>("/api/credentials");
      setCredentials(data);
    } catch {}
  };

  const loadProviders = async () => {
    try {
      const data = await api.get<Provider[]>("/api/providers");
      setProviders(data);
    } catch {}
  };

  const loadTemplates = async () => {
    try {
      const data = await api.get<Template[]>("/api/settings/prompt-template");
      setTemplates(data);
      const match = data.find((t) => t.strictness === activeStrictness || (activeStrictness === "all" && t.strictness === "all"));
      if (match) {
        setActiveTemplateId(match.id);
        setEditorContent(match.content);
        setTemplateDirty(false);
      }
    } catch {}
  };

  const handleStrictnessChange = (level: string) => {
    setActiveStrictness(level);
    const match = templates.find((t) => t.strictness === level || (level === "all" && t.strictness === "all"));
    if (match) {
      setActiveTemplateId(match.id);
      setEditorContent(match.content);
      setTemplateDirty(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!activeTemplateId) return;
    try {
      await api.put(`/api/settings/prompt-template/${activeTemplateId}`, {
        content: editorContent,
        strictness: activeStrictness,
      });
      toast({ title: "Template saved" });
      setTemplateDirty(false);
      loadTemplates();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  const handleEnhance = async () => {
    setEnhancing(true);
    try {
      const data = await api.post<{ content: string }>("/api/settings/prompt-template/enhance", {
        content: editorContent,
        custom_prompt: enhancePrompt || undefined,
      });
      setEditorContent(data.content);
      setTemplateDirty(true);
      setEnhanceExpanded(false);
      setEnhancePrompt("");
      toast({ title: "Template enhanced", description: "Review the changes and save when ready." });
    } catch (err) {
      toast({ title: "Enhancement failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  };

  const handleAddCredential = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/credentials", {
        username: fd.get("username"),
        app_password: fd.get("app_password"),
        workspace: fd.get("workspace"),
      });
      toast({ title: "Credential added" });
      setDialogOpen(null);
      loadCredentials();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add credential", variant: "destructive" });
    }
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await api.del(`/api/credentials/${id}`);
      toast({ title: "Credential deleted" }); loadCredentials();
    } catch {}
  };

  const handleAddProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/providers", {
        name: fd.get("name"),
        api_base: fd.get("api_base"),
        api_key: fd.get("api_key"),
      });
      toast({ title: "Provider added" });
      setDialogOpen(null);
      loadProviders();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add provider", variant: "destructive" });
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await api.del(`/api/providers/${id}`);
      toast({ title: "Provider deleted" }); loadProviders();
    } catch {}
  };

  const handleEditProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProvider) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {
      name: fd.get("name") as string,
      api_base: fd.get("api_base") as string,
    };
    const apiKey = fd.get("api_key") as string;
    if (apiKey) body.api_key = apiKey;
    try {
      await api.put(`/api/providers/${editingProvider.id}`, body);
      toast({ title: "Provider updated" });
      setEditingProvider(null);
      loadProviders();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update provider", variant: "destructive" });
    }
  };

  const handleAddRepo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = parseBitbucketUrl(repoUrl);
    const workspace = parsed?.workspace || fd.get("workspace");
    const slug = parsed?.slug || fd.get("slug");
    if (!workspace || !slug) {
      toast({ title: "Error", description: "Could not parse repository URL. Enter a valid Bitbucket URL (e.g. https://bitbucket.org/workspace/repo)", variant: "destructive" });
      return;
    }
    try {
      await api.post("/api/repositories", {
        name: fd.get("name") || slug, slug, workspace,
        credential_id: fd.get("credential_id"),
      });
      toast({ title: "Repository added" });
      setDialogOpen(null);
      setRepoUrl("");
      setParsedRepo(null);
      dispatch(fetchRepositories());
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add repository", variant: "destructive" });
    }
  };

  const handleDeleteRepo = async (id: string) => {
    try {
      await api.del(`/api/repositories/${id}`);
      toast({ title: "Repository deleted" }); dispatch(fetchRepositories());
    } catch {}
  };

  const updateRepo = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.put(`/api/repositories/${id}`, body);
      toast({ title: "Updated" }); dispatch(fetchRepositories());
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleTestLlm = async (repoId: string, providerId: string, model: string) => {
    setTestingRepo(repoId);
    setTestResult((prev) => { const next = { ...prev }; delete next[repoId]; return next; });
    try {
      const data = await api.post<{ success: boolean; reply?: string; latencyMs?: number; error?: string }>("/api/settings/llm/test", {
        provider_id: providerId, model,
      });
      if (data.success) {
        setTestResult((prev) => ({ ...prev, [repoId]: `${data.latencyMs}ms` }));
        toast({ title: "LLM connection OK", description: `Reply: ${data.reply} (${data.latencyMs}ms)` });
      } else {
        setTestResult((prev) => ({ ...prev, [repoId]: "failed" }));
        toast({ title: "LLM test failed", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      setTestResult((prev) => ({ ...prev, [repoId]: "failed" }));
      toast({ title: "LLM test failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setTestingRepo(null);
    }
  };

  const handleFetchModels = async (providerId: string) => {
    try {
      const data = await api.get<{ models: string[] }>(`/api/providers/${providerId}/models`);
      setFetchedModels((prev) => ({ ...prev, [providerId]: data.models }));
    } catch (err) {
      toast({ title: "Failed to fetch models", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05} duration={0.35} inView>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      </BlurFade>

      <BlurFade delay={0.1} duration={0.4} inView>
      <Tabs defaultValue="providers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="providers">LLM Providers</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="repositories">Repositories</TabsTrigger>
          <TabsTrigger value="review">Review Config</TabsTrigger>
          <TabsTrigger value="llm">LLM</TabsTrigger>
          <TabsTrigger value="prompt">Prompt Template</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">OpenAI-compatible LLM providers</p>
            <Dialog open={dialogOpen === "provider"} onOpenChange={(o) => { setDialogOpen(o ? "provider" : null); if (!o) setProviderPreset("custom"); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Provider</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add LLM Provider</DialogTitle></DialogHeader>
                <form onSubmit={handleAddProvider} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provider Type</Label>
                    <Select value={providerPreset} onValueChange={(v) => setProviderPreset(v)}>
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
                  <Button type="submit" className="w-full">Save</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {providers.map((p) => (
            <Card key={p.id} className="relative overflow-hidden">
              <BorderBeam size={40} duration={8} colorFrom="#e5e5e5" colorTo="#e5e5e51a" borderWidth={1} />
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{p.api_base}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEditProviderPreset(detectProviderPreset(p.api_base)); setEditingProvider(p); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteProvider(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {providers.length === 0 && <p className="py-8 text-center text-muted-foreground">No providers configured. Add one to start using LLM-powered reviews.</p>}

          <Dialog open={!!editingProvider} onOpenChange={(o) => { if (!o) { setEditingProvider(null); setEditProviderPreset("custom"); } else if (editingProvider) { setEditProviderPreset(detectProviderPreset(editingProvider.api_base)); } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
              <form onSubmit={handleEditProvider} className="space-y-4">
                <div className="space-y-2">
                  <Label>Provider Type</Label>
                  <Select value={editProviderPreset} onValueChange={(v) => setEditProviderPreset(v)}>
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
                <Button type="submit" className="w-full">Update</Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="credentials" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Bitbucket Cloud credentials</p>
            <Dialog open={dialogOpen === "cred"} onOpenChange={(o) => setDialogOpen(o ? "cred" : null)}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Credential</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Credential</DialogTitle></DialogHeader>
                <form onSubmit={handleAddCredential} className="space-y-4">
                  <div className="space-y-2"><Label>Username</Label><Input name="username" required /></div>
                  <div className="space-y-2"><Label>App Password</Label><Input name="app_password" type="password" required /></div>
                  <div className="space-y-2"><Label>Workspace (optional)</Label><Input name="workspace" /></div>
                  <Button type="submit" className="w-full">Save</Button>
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
                <Button variant="ghost" size="icon" onClick={() => handleDeleteCredential(cred.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
          {credentials.length === 0 && <p className="py-8 text-center text-muted-foreground">No credentials configured</p>}
        </TabsContent>

        <TabsContent value="repositories" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Connected repositories</p>
            <Dialog open={dialogOpen === "repo"} onOpenChange={(o) => { setDialogOpen(o ? "repo" : null); if (!o) { setRepoUrl(""); setParsedRepo(null); } }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Add Repository</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Repository</DialogTitle></DialogHeader>
                <form onSubmit={handleAddRepo} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Repository URL</Label>
                    <Input
                      required
                      placeholder="https://bitbucket.org/workspace/repo-slug"
                      value={repoUrl}
                      onChange={(e) => {
                        setRepoUrl(e.target.value);
                        setParsedRepo(parseBitbucketUrl(e.target.value));
                      }}
                    />
                    {parsedRepo && (
                      <p className="text-xs text-muted-foreground">
                        Workspace: <span className="font-mono text-foreground">{parsedRepo.workspace}</span> &middot; Slug: <span className="font-mono text-foreground">{parsedRepo.slug}</span>
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
                  <Button type="submit" className="w-full">Add Repository</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {(repos as Repository[]).map((repo) => (
            <Card key={String(repo.id)}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{String(repo.name)}</p>
                  <p className="text-sm text-muted-foreground font-mono">{String(repo.workspace)}/{String(repo.slug)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{String(repo.review_mode)}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteRepo(String(repo.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {repos.length === 0 && <p className="py-8 text-center text-muted-foreground">No repositories configured</p>}
        </TabsContent>

        <TabsContent value="review" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Configure review settings per repository</p>
          {(repos as Repository[]).map((repo) => (
            <Card key={String(repo.id)}>
              <CardHeader><CardTitle className="text-base">{String(repo.name)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Review Mode</Label>
                    <Select defaultValue={String(repo.review_mode)} onValueChange={(v) => updateRepo(String(repo.id), { review_mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="automatic">Automatic</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Strictness</Label>
                    <Select defaultValue={String(repo.strictness)} onValueChange={(v) => updateRepo(String(repo.id), { strictness: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="strict">Strict</SelectItem><SelectItem value="balanced">Balanced</SelectItem><SelectItem value="light">Light</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Excluded Paths</Label>
                  <Input defaultValue={String(repo.excluded_paths || "")} placeholder="node_modules/, *.min.js" onBlur={(e) => updateRepo(String(repo.id), { excluded_paths: e.target.value })} />
                </div>
                <Separator />
                <div className="flex items-center gap-4">
                  <Label className="text-sm">Auto Review</Label>
                  <Select defaultValue={Number(repo.auto_review_enabled) ? "on" : "off"} onValueChange={(v) => updateRepo(String(repo.id), { auto_review_enabled: v === "on" ? 1 : 0 })}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="on">On</SelectItem><SelectItem value="off">Off</SelectItem></SelectContent>
                  </Select>
                  <Label className="text-sm">Poll (min)</Label>
                  <Input type="number" className="w-20" defaultValue={String(repo.poll_interval_minutes || 5)} onBlur={(e) => updateRepo(String(repo.id), { poll_interval_minutes: Number(e.target.value) })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="llm" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Assign LLM provider and model per repository</p>
          {(repos as Repository[]).map((repo) => {
            const providerId = String(repo.llm_provider_id || "");
            const provider = providers.find((p) => p.id === providerId);
            const preset = provider ? detectProviderPreset(provider.api_base) : "custom";
            const presetModels = PROVIDER_PRESETS[preset]?.models || [];
            const apiModels = fetchedModels[providerId] || [];
            const modelList = apiModels.length > 0 ? apiModels : presetModels;

            const saveLlm = (patch: Record<string, unknown>) =>
              api.put(`/api/settings/llm/${String(repo.id)}`, {
                llm_provider: provider?.name || String(repo.llm_provider),
                llm_provider_id: providerId,
                llm_model: String(repo.llm_model),
                llm_max_tokens: Number(repo.llm_max_tokens),
                llm_temperature: Number(repo.llm_temperature),
                ...patch,
              }).then(() => { toast({ title: "Updated" }); dispatch(fetchRepositories()); }).catch(() => toast({ title: "Error", variant: "destructive" }));

            return (
              <Card key={String(repo.id)}>
                <CardHeader><CardTitle className="text-base">{String(repo.name)}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select
                        defaultValue={providerId}
                        onValueChange={(v) => {
                          const p = providers.find((x) => x.id === v);
                          api.put(`/api/settings/llm/${String(repo.id)}`, {
                            llm_provider: p?.name || "",
                            llm_provider_id: v,
                            llm_model: "",
                            llm_max_tokens: Number(repo.llm_max_tokens),
                            llm_temperature: Number(repo.llm_temperature),
                          }).then(() => { toast({ title: "Provider updated" }); dispatch(fetchRepositories()); }).catch(() => toast({ title: "Error updating provider", variant: "destructive" }));
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                        <SelectContent>
                          {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Model</Label>
                        {providerId && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleFetchModels(providerId)}>
                            Fetch models
                          </Button>
                        )}
                      </div>
                      {modelList.length > 0 ? (
                        <Select defaultValue={String(repo.llm_model || modelList[0])} onValueChange={(v) => saveLlm({ llm_model: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{modelList.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input defaultValue={String(repo.llm_model || "gpt-4")} onBlur={(e) => saveLlm({ llm_model: e.target.value })} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Max Tokens</Label><Input type="number" defaultValue={String(repo.llm_max_tokens || 4096)} onBlur={(e) => saveLlm({ llm_max_tokens: Number(e.target.value) })} /></div>
                    <div className="space-y-2"><Label>Temperature</Label><Input type="number" step="0.1" defaultValue={String(repo.llm_temperature || 0.2)} onBlur={(e) => saveLlm({ llm_temperature: Number(e.target.value) })} /></div>
                  </div>
                  {providerId && (
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={testingRepo === String(repo.id)}
                        onClick={() => handleTestLlm(String(repo.id), providerId, String(repo.llm_model))}
                      >
                        {testingRepo === String(repo.id) ? "Testing..." : "Test Connection"}
                      </Button>
                      {testResult[String(repo.id)] && (
                        <Badge variant={testResult[String(repo.id)] === "failed" ? "destructive" : "default"}>
                          {testResult[String(repo.id)] === "failed" ? "Failed" : testResult[String(repo.id)]}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {providers.length === 0 && <p className="text-sm text-amber-500">Add an LLM provider first (see LLM Providers tab).</p>}
        </TabsContent>

        <TabsContent value="prompt" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            {["all", "strict", "balanced", "light"].map((level) => (
              <Button key={level} variant={activeStrictness === level ? "default" : "outline"} size="sm" onClick={() => handleStrictnessChange(level)}>
                {level === "all" ? "Default" : level.charAt(0).toUpperCase() + level.slice(1)}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setEnhanceExpanded(!enhanceExpanded)}>
              <Sparkles className="mr-2 h-4 w-4" />Enhance with AI
            </Button>
            {templateDirty && <Badge variant="secondary">Unsaved changes</Badge>}
          </div>

          <AnimatePresence>
          {enhanceExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
            <div className="flex gap-2">
              <Textarea
                className="flex-1 min-h-[2.5rem] h-10 resize-none text-sm"
                value={enhancePrompt}
                onChange={(e) => setEnhancePrompt(e.target.value)}
                placeholder="Custom instructions (optional): e.g. Focus on security, add XSS checks..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnhance(); } }}
              />
              <Button size="sm" onClick={handleEnhance} disabled={enhancing}>
                {enhancing ? "Enhancing..." : "Enhance"}
              </Button>
            </div>
            </motion.div>
          )}
          </AnimatePresence>

          <Textarea
            className="h-[24rem] font-mono text-sm"
            value={editorContent}
            onChange={(e) => { setEditorContent(e.target.value); setTemplateDirty(true); }}
            placeholder="Loading template..."
          />

          {fixedOutputFormat && (
            <div className="rounded-md border border-dashed bg-secondary p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output Format — Fixed by Server (read-only)</p>
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{fixedOutputFormat.trim()}</pre>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveTemplate} disabled={!templateDirty}>Save Template</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {["{{diff}}", "{{file_paths}}", "{{strictness_level}}", "{{excluded_paths}}", "{{commit_hash}}", "{{commit_message}}", "{{branch}}", "{{repository}}"].map((v) => (
                <Badge key={v} variant="outline" className="font-mono text-xs">{v}</Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Configure SMTP and notification recipients per repository</p>
          {(repos as Repository[]).map((repo) => (
            <Card key={String(repo.id)}>
              <CardHeader><CardTitle className="text-base">{String(repo.name)}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>SMTP Host</Label><Input defaultValue={String(repo.smtp_host || "")} onBlur={(e) => api.put(`/api/settings/smtp/${String(repo.id)}`, { smtp_host: e.target.value, smtp_port: Number(repo.smtp_port), smtp_user: String(repo.smtp_user), smtp_from_address: String(repo.smtp_from_address) })} /></div>
                  <div className="space-y-2"><Label>SMTP Port</Label><Input type="number" defaultValue={String(repo.smtp_port || 587)} onBlur={(e) => api.put(`/api/settings/smtp/${String(repo.id)}`, { smtp_host: String(repo.smtp_host), smtp_port: Number(e.target.value), smtp_user: String(repo.smtp_user), smtp_from_address: String(repo.smtp_from_address) })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>SMTP User</Label><Input defaultValue={String(repo.smtp_user || "")} onBlur={(e) => api.put(`/api/settings/smtp/${String(repo.id)}`, { smtp_host: String(repo.smtp_host), smtp_port: Number(repo.smtp_port), smtp_user: e.target.value, smtp_from_address: String(repo.smtp_from_address) })} /></div>
                  <div className="space-y-2"><Label>From Address</Label><Input defaultValue={String(repo.smtp_from_address || "")} onBlur={(e) => api.put(`/api/settings/smtp/${String(repo.id)}`, { smtp_host: String(repo.smtp_host), smtp_port: Number(repo.smtp_port), smtp_user: String(repo.smtp_user), smtp_from_address: e.target.value })} /></div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Recipients (comma-separated)</Label>
                  <Input defaultValue={String(repo.notification_recipients || "")} onBlur={(e) => updateRepo(String(repo.id), { notification_recipients: e.target.value })} />
                </div>
                <div className="flex items-center gap-4">
                  <Label className="text-sm">Include Commit Author</Label>
                  <Select defaultValue={Number(repo.include_commit_author) ? "on" : "off"} onValueChange={(v) => updateRepo(String(repo.id), { include_commit_author: v === "on" ? 1 : 0 })}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="on">On</SelectItem><SelectItem value="off">Off</SelectItem></SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
       </Tabs>
      </BlurFade>
    </div>
  );
}
