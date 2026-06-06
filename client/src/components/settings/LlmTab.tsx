import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { Provider } from "./types";

export function LlmTab({ providers, loading }: { providers: Provider[]; loading?: boolean }) {
  const dispatch = useDispatch<AppDispatch>();
  const { items: repos } = useSelector((state: RootState) => state.repositories);
  const { toast } = useToast();
  const [testingRepo, setTestingRepo] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [savingLlm, setSavingLlm] = useState<Record<string, boolean>>({});
  const fetchedRef = useRef(new Set<string>());

  const handleFetchModels = useCallback(async (providerId: string) => {
    if (!providerId || fetchingModels[providerId]) return;
    setFetchingModels((prev) => ({ ...prev, [providerId]: true }));
    try {
      const data = await api.get<{ models: string[] }>(`/api/providers/${providerId}/models`);
      setFetchedModels((prev) => ({ ...prev, [providerId]: data.models }));
    } catch (err) {
      toast({ title: "Failed to fetch models", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setFetchingModels((prev) => ({ ...prev, [providerId]: false }));
    }
  }, [fetchingModels, toast]);

  useEffect(() => {
    const providerIds = new Set(providers.map((p) => p.id));
    for (const id of providerIds) {
      if (!fetchedRef.current.has(id)) {
        fetchedRef.current.add(id);
        handleFetchModels(id);
      }
    }
  }, [providers, handleFetchModels]);

  const handleTestLlm = async (repoId: string, providerId: string, model: string) => {
    setTestingRepo(repoId);
    setTestResult((prev) => { const next = { ...prev }; delete next[repoId]; return next; });
    try {
      const data = await api.post<{ success: boolean; reply?: string; latencyMs?: number; error?: string }>("/api/settings/llm/test", { provider_id: providerId, model });
      if (data.success) {
        setTestResult((prev) => ({ ...prev, [repoId]: `${data.latencyMs}ms` }));
        toast({ title: "LLM connection OK", description: `Reply: ${data.reply} (${data.latencyMs}ms)`, variant: "success" });
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

  return (
    <>
      <p className="text-sm text-muted-foreground">Assign LLM provider and model per repository</p>
      {repos.map((repo) => {
        const providerId = String(repo.llm_provider_id || "");
        const provider = providers.find((p) => p.id === providerId);
        const modelList = fetchedModels[providerId] || [];
        const isLoadingModels = !!fetchingModels[providerId];

        const saveLlm = (patch: Record<string, unknown>) => {
          setSavingLlm((prev) => ({ ...prev, [String(repo.id)]: true }));
          api.put(`/api/settings/llm/${String(repo.id)}`, {
            llm_provider: provider?.name || String(repo.llm_provider),
            llm_provider_id: providerId,
            llm_model: String(repo.llm_model),
            llm_max_tokens: Number(repo.llm_max_tokens),
            llm_temperature: Number(repo.llm_temperature),
            ...patch,
          }).then(() => { toast({ title: "Updated", variant: "success" }); dispatch(fetchRepositories()); }).catch(() => toast({ title: "Error", variant: "destructive" })).finally(() => setSavingLlm((prev) => ({ ...prev, [String(repo.id)]: false })));
        };

        return (
          <Card key={String(repo.id)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{String(repo.name)}</CardTitle>
              {savingLlm[String(repo.id)] && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    defaultValue={providerId}
                    onValueChange={(v) => {
                      const p = providers.find((x) => x.id === v);
                      setSavingLlm((prev) => ({ ...prev, [String(repo.id)]: true }));
                      api.put(`/api/settings/llm/${String(repo.id)}`, {
                        llm_provider: p?.name || "", llm_provider_id: v, llm_model: "",
                        llm_max_tokens: Number(repo.llm_max_tokens), llm_temperature: Number(repo.llm_temperature),
                      }).then(() => { toast({ title: "Provider updated", variant: "success" }); dispatch(fetchRepositories()); }).catch(() => toast({ title: "Error updating provider", variant: "destructive" })).finally(() => setSavingLlm((prev) => ({ ...prev, [String(repo.id)]: false })));
                      if (!fetchedRef.current.has(v)) {
                        fetchedRef.current.add(v);
                        handleFetchModels(v);
                      }
                    }}
                    disabled={savingLlm[String(repo.id)]}
                  >
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  {isLoadingModels ? (
                    <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading models...
                    </div>
                  ) : modelList.length > 0 ? (
                    <Select defaultValue={String(repo.llm_model || modelList[0])} onValueChange={(v) => saveLlm({ llm_model: v })} disabled={savingLlm[String(repo.id)]}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{modelList.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input defaultValue={String(repo.llm_model || "")} onBlur={(e) => saveLlm({ llm_model: e.target.value })} disabled={savingLlm[String(repo.id)]} placeholder="Enter model name" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Max Tokens</Label><Input type="number" defaultValue={String(repo.llm_max_tokens || 4096)} onBlur={(e) => saveLlm({ llm_max_tokens: Number(e.target.value) })} disabled={savingLlm[String(repo.id)]} /></div>
                <div className="space-y-2"><Label>Temperature</Label><Input type="number" step="0.1" defaultValue={String(repo.llm_temperature || 0.2)} onBlur={(e) => saveLlm({ llm_temperature: Number(e.target.value) })} disabled={savingLlm[String(repo.id)]} /></div>
              </div>
              {providerId && (
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={testingRepo === String(repo.id)} onClick={() => handleTestLlm(String(repo.id), providerId, String(repo.llm_model))}>
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
      {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />)}
      {!loading && providers.length === 0 && <p className="text-sm text-warning">Add an LLM provider first (see LLM Providers tab).</p>}
    </>
  );
}
