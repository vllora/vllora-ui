/**
 * DatasetBreadcrumbBar
 *
 * Two-part navigation bar inspired by VS Code:
 *
 * 1. **Title bar** (always visible, above tabs):
 *    Shows 🗄 Dataset Name — click to rename inline.
 *
 * 2. **Path breadcrumb** (only when in a subfolder):
 *    Shows subfolder segments below the tab strip.
 *    Hidden for top-level files like plan.md, readme.md.
 */

import { useState, useRef, useEffect } from "react";
import { Database, ChevronRight, Pencil } from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { evalJobDisplayName, finetuneJobDisplayName } from "@/lib/job-display-name";

/* ------------------------------------------------------------------ */
/*  DatasetTitleBar — top-level name bar with inline rename            */
/* ------------------------------------------------------------------ */

export function DatasetTitleBar() {
  const { dataset, handleRenameDataset } = DatasetDetailConsumer();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const datasetName = dataset?.name || "Untitled Workflow";

  const handleStartEdit = () => {
    setEditValue(datasetName);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== datasetName) {
      await handleRenameDataset(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border bg-background text-[12px] text-muted-foreground min-h-[28px] shrink-0">
      <Database className="w-3.5 h-3.5 text-[rgb(var(--theme-500))] shrink-0" />

      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          onBlur={handleSave}
          className="h-5 px-1 bg-muted border border-border rounded text-[12px] text-foreground outline-none focus:ring-1 focus:ring-[rgb(var(--theme-500))] w-64"
        />
      ) : (
        <button
          onClick={handleStartEdit}
          className="flex items-center gap-1 hover:text-foreground transition-colors group truncate"
          title={dataset?.datasetObjective ? `${datasetName}\n${dataset.datasetObjective}` : datasetName}
        >
          <span className="truncate font-medium text-foreground/80 group-hover:text-foreground">
            {datasetName}
          </span>
          <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DatasetBreadcrumbBar — subfolder path (only renders when needed)    */
/* ------------------------------------------------------------------ */

const TRACE_ANALYSIS_SEGMENT_LABEL: Record<string, string> = {
  "trace-analysis": "Production Traces",
  priority: "Priority & Coverage",
  "grader-hints": "Quality Checks",
  "seed-queries": "Real Customer Questions",
};

export function DatasetBreadcrumbBar() {
  const { activeTabPath } = WorkspaceTabsConsumer();

  // Only show for paths that have folder segments (e.g., "openings/topic-1")
  // Top-level files like "plan.md", "readme.md" don't get a breadcrumb
  if (!activeTabPath || !activeTabPath.includes("/")) return null;

  const segments = activeTabPath.split("/");

  // Map raw UUID segments to friendly display names for known paths
  const displaySegments = segments.map((segment, i) => {
    // evaluations/jobs/<jobId> → show eval-abc123 instead of UUID
    if (i === 2 && segments[0] === "evaluations" && segments[1] === "jobs") {
      return evalJobDisplayName(segment);
    }
    // finetune/<jobId> → show ft-abc123 instead of UUID
    if (i === 1 && segments[0] === "finetune") {
      return finetuneJobDisplayName(segment);
    }
    // trace-analysis/<tab> → show "Production Traces > Priority & Coverage"
    if (segments[0] === "trace-analysis" && TRACE_ANALYSIS_SEGMENT_LABEL[segment]) {
      return TRACE_ANALYSIS_SEGMENT_LABEL[segment];
    }
    return segment;
  });

  return (
    <div className="flex items-center gap-1 px-3 py-0.5 border-b border-border bg-background text-[11px] text-muted-foreground min-h-[22px] shrink-0">
      {displaySegments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />}
          <span className={i === displaySegments.length - 1 ? "text-foreground/70" : "text-muted-foreground/60"}>
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}
