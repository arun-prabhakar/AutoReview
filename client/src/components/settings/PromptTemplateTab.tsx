import { useState } from "react";
import { api } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Template } from "./types";

export function PromptTemplateTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeStrictness, setActiveStrictness] = useState("all");
  const [editorContent, setEditorContent] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [enhanceExpanded, setEnhanceExpanded] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState("");
  const [fixedOutputFormat, setFixedOutputFormat] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    loadTemplates();
    api.get<{ content: string }>("/api/settings/prompt-template/fixed-output-format")
      .then((d) => setFixedOutputFormat(d.content))
      .catch(() => {});
  }

  async function loadTemplates() {
    try {
      const data = await api.get<Template[]>("/api/settings/prompt-template");
      setTemplates(data);
      const match = data.find((t) => t.strictness === activeStrictness || (activeStrictness === "all" && t.strictness === "all"));
      if (match) { setActiveTemplateId(match.id); setEditorContent(match.content); setTemplateDirty(false); }
    } catch {}
  }

  const handleStrictnessChange = (level: string) => {
    setActiveStrictness(level);
    const match = templates.find((t) => t.strictness === level || (level === "all" && t.strictness === "all"));
    if (match) { setActiveTemplateId(match.id); setEditorContent(match.content); setTemplateDirty(false); }
  };

  const handleSave = async () => {
    if (!activeTemplateId) return;
    setSaving(true);
    try {
      await api.put(`/api/settings/prompt-template/${activeTemplateId}`, { content: editorContent, strictness: activeStrictness });
      toast({ title: "Template saved", variant: "success" });
      setTemplateDirty(false);
      loadTemplates();
    } catch { toast({ title: "Save failed", variant: "destructive" }); } finally { setSaving(false); }
  };

  const handleEnhance = async () => {
    setEnhancing(true);
    try {
      const data = await api.post<{ content: string }>("/api/settings/prompt-template/enhance", { content: editorContent, custom_prompt: enhancePrompt || undefined });
      setEditorContent(data.content);
      setTemplateDirty(true);
      setEnhanceExpanded(false);
      setEnhancePrompt("");
      toast({ title: "Template enhanced", description: "Review the changes and save when ready.", variant: "success" });
    } catch (err) {
      toast({ title: "Enhancement failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setEnhancing(false); }
  };

  return (
    <>
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
            placeholder="Custom instructions (optional): e.g. Focus on security..."
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
          <Button size="sm" onClick={handleSave} disabled={!templateDirty || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving..." : "Save Template"}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {["{{diff}}", "{{file_paths}}", "{{strictness_level}}", "{{excluded_paths}}", "{{commit_hash}}", "{{commit_message}}", "{{branch}}", "{{repository}}"].map((v) => (
            <Badge key={v} variant="outline" className="font-mono text-xs">{v}</Badge>
          ))}
        </div>
      </div>
    </>
  );
}
