/**
 * SkillFileViewer
 *
 * Renders a single file from the skill package in the workspace.
 * - Markdown files: preview (default) or edit mode with Monaco editor
 * - JSONL files: conversation card viewer with collapsible examples
 *
 * Files are regenerated on demand from IndexedDB data — zero LLM calls, ~100ms.
 * User edits to markdown files are stored in component state and included
 * when downloading the ZIP.
 */

import { useMemo, useCallback, useState, useRef } from "react";
import { useRequest } from "ahooks";
import { Download, Loader2, FileWarning, Pencil, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import LazyMarkdownRenderer from "@/components/chat/LazyMarkdownRenderer";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import {
  assembleSkillPackageFiles,
  type SkillPackageFiles,
} from "@/lib/distri-finetune-tools/steps/generate-skill-package";
import { ConversationDataTable, parseJsonlContent } from "./conversation-data-table";

interface SkillFileViewerProps {
  /** Relative path within the skill package, e.g. "SKILL.md", "examples/using-joins.jsonl" */
  readonly filePath: string;
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

/** Build a ZIP blob from assembled files, overlaying any user edits */
async function buildZipWithEdits(
  files: SkillPackageFiles,
  editedFiles: ReadonlyMap<string, string>,
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const root = zip.folder(files.skillSlug)!;

  // Use edited content where available, otherwise original
  root.file("SKILL.md", editedFiles.get("SKILL.md") ?? files.skillMd);
  root.file(
    "rules/response-guidelines.md",
    editedFiles.get("rules/response-guidelines.md") ?? files.rulesDoc,
  );
  root.file(
    "examples/index.md",
    editedFiles.get("examples/index.md") ?? files.examplesIndex,
  );

  for (const [slug, jsonl] of files.topicFiles) {
    root.file(`examples/${slug}.jsonl`, jsonl);
  }

  if (files.knowledgeDoc) {
    root.file(
      "knowledge/domain-knowledge.md",
      editedFiles.get("knowledge/domain-knowledge.md") ?? files.knowledgeDoc,
    );
  }

  return zip.generateAsync({ type: "blob" });
}

/** Thin wrapper that memoizes JSONL parsing before rendering the unified table */
function JsonlContent({ content }: { readonly content: string }) {
  const parsed = useMemo(() => parseJsonlContent(content), [content]);
  return (
    <ConversationDataTable
      rows={parsed.rows}
      mode="jsonl-read-only"
      systemPrompt={parsed.commonSystem}
    />
  );
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

  // ─── Edit state ───
  // Persists across file switches since the component stays mounted
  const editedFilesRef = useRef<Map<string, string>>(new Map());
  const [editedFiles, setEditedFiles] = useState<Map<string, string>>(new Map());
  const [isEditing, setIsEditing] = useState(false);

  const handleEditChange = useCallback((filePath: string, value: string) => {
    setEditedFiles((prev) => {
      const next = new Map(prev);
      next.set(filePath, value);
      editedFilesRef.current = next;
      return next;
    });
  }, []);

  const handleResetFile = useCallback((filePath: string) => {
    setEditedFiles((prev) => {
      const next = new Map(prev);
      next.delete(filePath);
      editedFilesRef.current = next;
      return next;
    });
  }, []);

  const hasEdits = editedFiles.size > 0;
  const isCurrentFileModified = editedFiles.has(filePath);

  // ─── Download ZIP handler ───
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadZip = useCallback(async () => {
    if (!files) {
      toast.error("No data available to download");
      return;
    }
    setIsDownloading(true);
    try {
      const blob = await buildZipWithEdits(files, editedFilesRef.current);
      const filename = `${files.skillSlug}.zip`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();

      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 100);

      const editCount = editedFilesRef.current.size;
      const suffix = editCount > 0
        ? ` (${editCount} file${editCount !== 1 ? "s" : ""} modified)`
        : "";
      toast.success(`Skill package downloaded${suffix}`);
    } catch {
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  }, [files]);

  // ─── Resolve content ───
  const originalContent = useMemo(() => {
    if (!files) return null;
    return resolveFileContent(files, filePath);
  }, [files, filePath]);

  const isMarkdown = filePath.endsWith(".md");
  const isJsonl = filePath.endsWith(".jsonl");

  // For markdown files: use edited content if available
  const displayContent = isMarkdown
    ? (editedFiles.get(filePath) ?? originalContent)
    : originalContent;

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Assembling skill package…
      </div>
    );
  }

  // ─── Error or no data ───
  if (error || !files) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <FileWarning className="w-5 h-5" />
        {error ? "Failed to assemble skill package" : "No data available to generate skill package"}
      </div>
    );
  }

  // ─── File not found ───
  if (originalContent === null) {
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
          {isCurrentFileModified && (
            <span className="ml-1.5 text-[rgb(var(--theme-400))]">●</span>
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {/* Edit/Preview toggle — only for markdown files */}
          {isMarkdown && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </>
                )}
              </Button>

              {/* Reset button — visible when current file is modified */}
              {isCurrentFileModified && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => handleResetFile(filePath)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </Button>
              )}
            </>
          )}

          {/* Download ZIP */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={isDownloading}
            onClick={handleDownloadZip}
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Download ZIP
            {hasEdits && (
              <span className="ml-0.5 text-[10px] text-[rgb(var(--theme-400))]">
                ({editedFiles.size})
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      {isMarkdown && isEditing ? (
        /* Monaco editor for markdown edit mode */
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language="markdown"
            value={displayContent ?? ""}
            onChange={(v) => handleEditChange(filePath, v ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 16, bottom: 16 },
              scrollbar: {
                vertical: "auto",
                horizontal: "hidden",
                verticalScrollbarSize: 8,
              },
            }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {isMarkdown ? (
            <div className="max-w-3xl mx-auto prose prose-sm prose-invert">
              <LazyMarkdownRenderer content={displayContent ?? ""} />
            </div>
          ) : isJsonl ? (
            <JsonlContent content={originalContent} />
          ) : (
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
              {originalContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
