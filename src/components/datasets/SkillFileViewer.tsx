/**
 * SkillFileViewer
 *
 * Renders a single file from the skill package in the workspace.
 * - Markdown files: preview (default) or edit mode with Monaco editor
 * - JSONL files: conversation card viewer with collapsible examples
 *
 * Files are regenerated on demand from IndexedDB data — zero LLM calls, ~100ms.
 * User edits to markdown files are stored in component state for preview.
 * Download is handled by the SKILL section hover action in the explorer sidebar.
 */

import { useMemo, useCallback, useState } from "react";
import { useRequest } from "ahooks";
import { Loader2, FileWarning, Pencil, Eye, RotateCcw } from "lucide-react";
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
  /** Relative path within the skill package, e.g. "SKILL.md", "resources/using-joins.jsonl" */
  readonly filePath: string;
}

/**
 * Convert YAML frontmatter (---...---) into a fenced code block
 * so the markdown renderer shows it as a styled code block instead of raw text.
 */
function formatYamlFrontmatter(md: string): string {
  const match = md.match(/^---\n([\s\S]*?)\n---\n*/);
  if (!match) return md;
  const yamlContent = match[1].trim();
  const rest = md.slice(match[0].length);
  return `\`\`\`yaml\n${yamlContent}\n\`\`\`\n\n${rest}`;
}

/** Resolve a file path to the corresponding content from assembled files */
function resolveFileContent(
  files: SkillPackageFiles,
  filePath: string,
): string | null {
  if (filePath === "SKILL.md") return files.skillMd;
  if (filePath === "resources/index.md") return files.resourcesIndex;
  if (filePath === "knowledge/domain-knowledge.md") return files.knowledgeDoc;

  // knowledge/sections/{filename}.md
  const sectionMatch = filePath.match(/^knowledge\/sections\/(.+\.md)$/);
  if (sectionMatch) {
    const sectionPath = `sections/${sectionMatch[1]}`;
    return files.sectionFiles.get(sectionPath) ?? null;
  }
  
  // resources/{slug}.jsonl
  const jsonlMatch = filePath.match(/^resources\/(.+)\.jsonl$/);
  if (jsonlMatch) {
    return files.topicFiles.get(jsonlMatch[1]) ?? null;
  }

  return null;
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
  const [editedFiles, setEditedFiles] = useState<Map<string, string>>(new Map());
  const [isEditing, setIsEditing] = useState(false);

  const handleEditChange = useCallback((filePath: string, value: string) => {
    setEditedFiles((prev) => {
      const next = new Map(prev);
      next.set(filePath, value);
      return next;
    });
  }, []);

  const handleResetFile = useCallback((filePath: string) => {
    setEditedFiles((prev) => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  const isCurrentFileModified = editedFiles.has(filePath);

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

        {/* Edit/Preview toggle — only for markdown files */}
        {isMarkdown && (
          <div className="flex items-center gap-1 shrink-0">
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
          </div>
        )}
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
            <div className="max-w-3xl mx-auto prose prose-sm prose-invert [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_td]:text-xs [&_th]:text-xs [&_code]:text-[11px] [&_pre]:text-[11px]">
              <LazyMarkdownRenderer content={formatYamlFrontmatter(displayContent ?? "")} />
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
