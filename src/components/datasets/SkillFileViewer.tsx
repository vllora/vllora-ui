/**
 * SkillFileViewer
 *
 * Renders a single file from the skill package in the workspace.
 * Files are regenerated on demand from IndexedDB data — zero LLM calls, ~100ms.
 * Pattern follows InsightsPane: pure data assembly → markdown/code rendering.
 */

import { useMemo, useCallback, useState } from "react";
import { useRequest } from "ahooks";
import { Download, Loader2, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import {
  assembleSkillPackageFiles,
  type SkillPackageFiles,
} from "@/lib/distri-finetune-tools/steps/generate-skill-package";
import { generateSkillPackageHandler } from "@/lib/distri-finetune-tools/steps/generate-skill-package";
import { downloadSkillPackageHandler } from "@/lib/distri-finetune-tools/steps/download-skill-package";
import { getWorkflowByDataset } from "@/services/finetune-workflow-db";

interface SkillFileViewerProps {
  /** Relative path within the skill package, e.g. "SKILL.md", "examples/using-joins.jsonl" */
  filePath: string;
}

/** Resolve a file path to the corresponding content from assembled files */
function resolveFileContent(
  files: SkillPackageFiles,
  filePath: string,
): string | null {
  if (filePath === "SKILL.md") return files.skillMd;
  if (filePath === "rules/response-guidelines.md") return files.rulesDoc;
  if (filePath === "examples/index.md") return files.examplesIndex;
  if (filePath === "knowledge/domain-knowledge.md") return files.knowledgeDoc;

  // examples/{slug}.jsonl
  const jsonlMatch = filePath.match(/^examples\/(.+)\.jsonl$/);
  if (jsonlMatch) {
    return files.topicFiles.get(jsonlMatch[1]) ?? null;
  }

  return null;
}

export function SkillFileViewer({ filePath }: SkillFileViewerProps) {
  const { dataset } = DatasetDetailConsumer();
  const datasetId = dataset?.id;

  // Assemble files on demand — cached by ahooks useRequest
  const { data: files, loading, error } = useRequest(
    async (): Promise<SkillPackageFiles | null> => {
      if (!datasetId) return null;
      return assembleSkillPackageFiles(datasetId);
    },
    { refreshDeps: [datasetId] },
  );

  // Download ZIP handler
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadZip = useCallback(async () => {
    if (!datasetId) {
      toast.error("No dataset selected");
      return;
    }
    setIsDownloading(true);
    try {
      const workflow = await getWorkflowByDataset(datasetId);
      if (!workflow) {
        toast.error("No workflow found for this dataset");
        return;
      }
      const genResult = (await generateSkillPackageHandler({
        workflow_id: workflow.id,
      })) as { success: boolean; error?: string };
      if (!genResult.success) {
        toast.error(genResult.error ?? "Failed to generate skill package");
        return;
      }
      const dlResult = (await downloadSkillPackageHandler({
        workflow_id: workflow.id,
      })) as { success: boolean; error?: string };
      if (!dlResult.success) {
        toast.error(dlResult.error ?? "Failed to download skill package");
        return;
      }
      toast.success("Skill package downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  }, [datasetId]);

  // Resolve content for the current file path
  const content = useMemo(() => {
    if (!files) return null;
    return resolveFileContent(files, filePath);
  }, [files, filePath]);

  const isMarkdown = filePath.endsWith(".md");

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Assembling skill package…
      </div>
    );
  }

  // Error or no data
  if (error || !files) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <FileWarning className="w-5 h-5" />
        {error ? "Failed to assemble skill package" : "No data available to generate skill package"}
      </div>
    );
  }

  // File not found in package
  if (content === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <FileWarning className="w-5 h-5" />
        File not found in skill package: {filePath}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-xs text-muted-foreground font-mono truncate">
          {files.skillSlug}/{filePath}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 shrink-0"
          disabled={isDownloading}
          onClick={handleDownloadZip}
        >
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Download ZIP
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isMarkdown ? (
          <div className="max-w-3xl mx-auto prose prose-sm prose-invert">
            <LazyMarkdownRenderer content={content} />
          </div>
        ) : (
          <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
