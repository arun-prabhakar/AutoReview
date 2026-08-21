import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { AppDispatch, RootState } from "@/store";
import { fetchRepositories } from "@/store/repositoriesSlice";
import { api } from "@/services/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Cpu, KeyRound, FolderGit2, Settings2, Brain, FileText, Bell, CheckCircle2, Circle } from "lucide-react";
import type { Credential, Provider } from "@/components/settings/types";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { CredentialsTab } from "@/components/settings/CredentialsTab";
import { RepositoriesTab } from "@/components/settings/RepositoriesTab";
import { ReviewConfigTab } from "@/components/settings/ReviewConfigTab";
import { LlmTab } from "@/components/settings/LlmTab";
import { PromptTemplateTab } from "@/components/settings/PromptTemplateTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { SetupWizard, type WizardStepDefinition } from "@/components/settings/SetupWizard";

const WIZARD_DISMISSED_KEY = "autoreview_setup_wizard_dismissed";

const TABS = [
  { value: "providers", label: "LLM Providers", icon: Cpu },
  { value: "credentials", label: "Credentials", icon: KeyRound },
  { value: "repositories", label: "Repositories", icon: FolderGit2 },
  { value: "review", label: "Review Config", icon: Settings2 },
  { value: "llm", label: "LLM", icon: Brain },
  { value: "prompt", label: "Prompt Template", icon: FileText },
  { value: "notifications", label: "Notifications", icon: Bell },
];

function readWizardDismissed(): boolean {
  try {
    return window.localStorage.getItem(WIZARD_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistWizardDismissal(): boolean {
  try {
    window.localStorage.setItem(WIZARD_DISMISSED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [wizardDismissed, setWizardDismissed] = useState(readWizardDismissed);
  const { toast } = useToast();
  const repositories = useSelector((state: RootState) => state.repositories.items);
  const repositoriesLoading = useSelector((state: RootState) => state.repositories.loading);
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

  const wizardSteps: WizardStepDefinition[] = [
    {
      key: "provider",
      label: "Add an LLM provider",
      description: "Connect an OpenAI-compatible endpoint or AWS Bedrock to power reviews.",
      tab: "providers",
      done: providers.length > 0,
    },
    {
      key: "credential",
      label: "Connect a Bitbucket credential",
      description: "Store an Atlassian email and API token so AutoReview can read your repositories.",
      tab: "credentials",
      done: credentials.length > 0,
    },
    {
      key: "repository",
      label: "Add a repository",
      description: "Pick a Bitbucket repository to review. You can add more at any time.",
      tab: "repositories",
      done: repositories.length > 0,
    },
  ];
  const completedSteps = wizardSteps.filter((step) => step.done).length;
  const setupIncomplete = completedSteps < wizardSteps.length;
  const setupLoaded = !loadingProviders && !loadingCredentials && !repositoriesLoading;
  const showWizard = setupIncomplete && setupLoaded && !wizardDismissed;

  const dismissWizard = () => {
    persistWizardDismissal();
    setWizardDismissed(true);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">Settings</h2>

      {showWizard && <SetupWizard steps={wizardSteps} onStart={setTab} onSkip={dismissWizard} />}

      <div className="space-y-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-medium">Setup</span>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={wizardSteps.length}
            aria-valuenow={completedSteps}
            className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-slow"
              style={{ width: `${(completedSteps / wizardSteps.length) * 100}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {setupIncomplete ? `${completedSteps} of ${wizardSteps.length} required steps complete` : "All required steps complete"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wizardSteps.map((step) => (
            <button
              key={step.key}
              onClick={() => setTab(step.tab)}
              aria-label={`${step.done ? "Completed" : "Pending"}: ${step.label}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !step.done && "text-interactive"
              )}
            >
              {step.done
                ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {repositories.length > 1 && <div className="flex items-center gap-3"><span className="text-sm font-medium">Repository scope</span><Select value={selectedRepository} onValueChange={(repo) => setSearchParams(repo === "all" ? { tab: activeTab } : { tab: activeTab, repo }, { replace: true })}><SelectTrigger className="w-full max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All repositories</SelectItem>{repositories.map((repo) => <SelectItem key={String(repo.id)} value={String(repo.id)}>{String(repo.name)}</SelectItem>)}</SelectContent></Select></div>}

      <Tabs value={activeTab} onValueChange={setTab}>
        <div className="relative">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto flex-nowrap snap-x snap-proximity pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:justify-center md:overflow-visible">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  aria-current={activeTab === tab.value ? "true" : undefined}
                  className="shrink-0 snap-start data-[state=active]:text-interactive"
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />
        </div>

        <TabsContent value="providers" className="space-y-3 mt-2">
          <ProvidersTab
            providers={providers}
            onRefresh={loadProviders}
            loading={loadingProviders}
            onNavigateTab={setTab}
            hasCredentials={credentials.length > 0}
            hasRepositories={repositories.length > 0}
          />
        </TabsContent>

        <TabsContent value="credentials" className="space-y-3 mt-2">
          <CredentialsTab
            credentials={credentials}
            onRefresh={loadCredentials}
            loading={loadingCredentials}
            onNavigateTab={setTab}
            hasRepositories={repositories.length > 0}
          />
        </TabsContent>

        <TabsContent value="repositories" className="space-y-3 mt-2">
          <RepositoriesTab
            credentials={credentials}
            loadingCredentials={loadingCredentials}
            onNavigateTab={setTab}
            hasProviders={providers.length > 0}
          />
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
