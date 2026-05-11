import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { AppDispatch } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Cpu, KeyRound, FolderGit2, Settings2, Brain, FileText, Bell, ShieldOff } from "lucide-react";
import type { Credential, Provider } from "@/components/settings/types";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { CredentialsTab } from "@/components/settings/CredentialsTab";
import { RepositoriesTab } from "@/components/settings/RepositoriesTab";
import { ReviewConfigTab } from "@/components/settings/ReviewConfigTab";
import { LlmTab } from "@/components/settings/LlmTab";
import { PromptTemplateTab } from "@/components/settings/PromptTemplateTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { SuppressionsTab } from "@/components/settings/SuppressionsTab";

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const { toast } = useToast();
  const activeTab = searchParams.get("tab") || "providers";

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
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <TabsList className="w-full flex-wrap h-auto gap-1">
          <TabsTrigger value="providers"><Cpu className="h-3.5 w-3.5 mr-1.5" />LLM Providers</TabsTrigger>
          <TabsTrigger value="credentials"><KeyRound className="h-3.5 w-3.5 mr-1.5" />Credentials</TabsTrigger>
          <TabsTrigger value="repositories"><FolderGit2 className="h-3.5 w-3.5 mr-1.5" />Repositories</TabsTrigger>
          <TabsTrigger value="review"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Review Config</TabsTrigger>
          <TabsTrigger value="llm"><Brain className="h-3.5 w-3.5 mr-1.5" />LLM</TabsTrigger>
          <TabsTrigger value="prompt"><FileText className="h-3.5 w-3.5 mr-1.5" />Prompt Template</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-3.5 w-3.5 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="suppressions"><ShieldOff className="h-3.5 w-3.5 mr-1.5" />Suppressions</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4 mt-4">
          <ProvidersTab providers={providers} onRefresh={loadProviders} loading={loadingProviders} />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-4 mt-4">
          <CredentialsTab credentials={credentials} onRefresh={loadCredentials} loading={loadingCredentials} />
        </TabsContent>

        <TabsContent value="repositories" className="space-y-4 mt-4">
          <RepositoriesTab credentials={credentials} loadingCredentials={loadingCredentials} />
        </TabsContent>

        <TabsContent value="review" className="space-y-4 mt-4">
          <ReviewConfigTab />
        </TabsContent>

        <TabsContent value="llm" className="space-y-4 mt-4">
          <LlmTab providers={providers} loading={loadingProviders} />
        </TabsContent>

        <TabsContent value="prompt" className="space-y-4 mt-4">
          <PromptTemplateTab />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-4">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="suppressions" className="space-y-4 mt-4">
          <SuppressionsTab />
        </TabsContent>
       </Tabs>
    </div>
  );
}
