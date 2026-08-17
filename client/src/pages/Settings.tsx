import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { AppDispatch, RootState } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Cpu, KeyRound, FolderGit2, Settings2, Brain, FileText, Bell, CheckCircle2, Circle } from "lucide-react";
import type { Credential, Provider } from "@/components/settings/types";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { CredentialsTab } from "@/components/settings/CredentialsTab";
import { RepositoriesTab } from "@/components/settings/RepositoriesTab";
import { ReviewConfigTab } from "@/components/settings/ReviewConfigTab";
import { LlmTab } from "@/components/settings/LlmTab";
import { PromptTemplateTab } from "@/components/settings/PromptTemplateTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const { toast } = useToast();
  const repositories = useSelector((state: RootState) => state.repositories.items);
  const activeTab = searchParams.get("tab") || "providers";
  const selectedRepository = searchParams.get("repo") || "all";
  const setTab = (tab: string) => setSearchParams(selectedRepository === "all" ? { tab } : { tab, repo: selectedRepository }, { replace: true });

  useEffect(() => {
    dispatch(fetchRepositories());
    loadCredentials();
    loadProviders();
  }, [dispatch]);

  const loadCredentials = async () => {
    setLoadingCredentials(true);
    try { setCredentials(await api.get<Credential[]>("/api/credentials")); } catch { toast({ title: "Failed to load credentials", variant: "destructive" }); }
    finally { setLoadingCredentials(false); }
  };

  const loadProviders = async () => {
    setLoadingProviders(true);
    try { setProviders(await api.get<Provider[]>("/api/providers")); } catch { toast({ title: "Failed to load providers", variant: "destructive" }); }
    finally { setLoadingProviders(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">Settings</h2>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 text-sm">
        <span className="font-medium mr-1">Setup readiness</span>
        {[
          { label: "Provider", ready: providers.length > 0, tab: "providers" },
          { label: "Credential", ready: credentials.length > 0, tab: "credentials" },
          { label: "Repository", ready: repositories.length > 0, tab: "repositories" },
          { label: "LLM assigned", ready: repositories.some((repo) => Boolean(repo.llm_provider_id && repo.llm_model)), tab: "llm" },
        ].map((item) => (
          <button key={item.label} onClick={() => setTab(item.tab)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {item.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}{item.label}
          </button>
        ))}
      </div>

      {repositories.length > 1 && <div className="flex items-center gap-3"><span className="text-sm font-medium">Repository scope</span><Select value={selectedRepository} onValueChange={(repo) => setSearchParams(repo === "all" ? { tab: activeTab } : { tab: activeTab, repo }, { replace: true })}><SelectTrigger className="w-full max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All repositories</SelectItem>{repositories.map((repo) => <SelectItem key={String(repo.id)} value={String(repo.id)}>{String(repo.name)}</SelectItem>)}</SelectContent></Select></div>}

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="providers"><Cpu className="h-3.5 w-3.5 mr-1.5" />LLM Providers</TabsTrigger>
          <TabsTrigger value="credentials"><KeyRound className="h-3.5 w-3.5 mr-1.5" />Credentials</TabsTrigger>
          <TabsTrigger value="repositories"><FolderGit2 className="h-3.5 w-3.5 mr-1.5" />Repositories</TabsTrigger>
          <TabsTrigger value="review"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Review Config</TabsTrigger>
          <TabsTrigger value="llm"><Brain className="h-3.5 w-3.5 mr-1.5" />LLM</TabsTrigger>
          <TabsTrigger value="prompt"><FileText className="h-3.5 w-3.5 mr-1.5" />Prompt Template</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" />Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-3 mt-2">
          <ProvidersTab providers={providers} onRefresh={loadProviders} loading={loadingProviders} />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-3 mt-2">
          <CredentialsTab credentials={credentials} onRefresh={loadCredentials} loading={loadingCredentials} />
        </TabsContent>

        <TabsContent value="repositories" className="space-y-3 mt-2">
          <RepositoriesTab credentials={credentials} loadingCredentials={loadingCredentials} />
        </TabsContent>

        <TabsContent value="review" className="space-y-3 mt-2">
          <ReviewConfigTab repositoryId={selectedRepository} />
        </TabsContent>

        <TabsContent value="llm" className="space-y-3 mt-2">
          <LlmTab providers={providers} loading={loadingProviders} repositoryId={selectedRepository} />
        </TabsContent>

        <TabsContent value="prompt" className="space-y-3 mt-2">
          <PromptTemplateTab />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-3 mt-2">
          <NotificationsTab repositoryId={selectedRepository} />
        </TabsContent>
       </Tabs>
    </div>
  );
}
