/**
 * TopicNodeHeader
 *
 * Renders a collapsible header row for a topic tree node.
 * Shows breadcrumb path, record count, coverage indicator, and action buttons.
 */

import { ChevronRight, Trash2, GitBranch, Grid2X2Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverageIndicator } from "../dataset-canvas/CoverageIndicator";
import { BreadcrumbPath } from "./BreadcrumbPath";
import type { PromptTextSegment } from "@/lib/distri-finetune-tools/steps/shared/topic-system-prompt";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TopicNodeHeaderProps {
  /** Breadcrumb path segments */
  path: string[];
  /** Optional description shown as tooltip on hover */
  description?: string;
  /** Whether this node has expandable content */
  hasContent: boolean;
  /** Whether the node is currently expanded */
  isExpanded: boolean;
  /** Toggle expand/collapse */
  onToggle: () => void;
  /** Total record count for this node and descendants */
  totalCount: number;
  /** Coverage percentage (0-100) */
  percentage: number;
  /** Whether this node has children (used to hide stats when expanded) */
  hasChildren: boolean;
  /** Accent color variant */
  variant?: "default" | "unassigned";
  /** Handler for deleting a topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Handler for generating records for a topic */
  onGenerateForTopic?: (topicPath: string) => void;
  /** Handler for generating subtopics (null = root level) */
  onGenerateSubtopics?: (topicPath: string | null) => void;
  /** Whether this topic is currently being generated */
  isGenerating?: boolean;
  /** Progress of data generation (completed/total) */
  generatingProgress?: { completed: number; total: number } | null;
  /** Whether this header is temporarily highlighted (e.g., from canvas "View in Table") */
  highlighted?: boolean;
  /** Shared system prompt for all records in this topic (shown once at group level) */
  systemPrompt?: string;
  /** Structured prompt segments for color-coded rendering (template vs topic names) */
  systemPromptSegments?: PromptTextSegment[];
}

export function TopicNodeHeader({
  path,
  description,
  hasContent,
  isExpanded,
  onToggle,
  totalCount,
  percentage,
  hasChildren,
  variant = "default",
  onDeleteTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  isGenerating,
  generatingProgress,
  highlighted,
  systemPrompt,
  systemPromptSegments,
}: TopicNodeHeaderProps) {
  const isUnassigned = variant === "unassigned";
  const topicPath = path.join("/");
  const topicName = path[path.length - 1] || "";
  const hasActions = !isUnassigned && (onGenerateForTopic || onGenerateSubtopics || onDeleteTopic);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "group w-full flex items-center gap-2 py-2 px-3 text-left transition-colors",
          "bg-muted/60 hover:bg-muted/80 border-l-2",
          isUnassigned ? "border-l-amber-500/40" : "border-l-[rgba(var(--theme-500),0.4)]",
          highlighted && "animate-record-highlight rounded-sm"
        )}
      >
        {/* Expand/collapse button */}
        <button
          className={cn(
            "w-6 h-6 flex items-center justify-center shrink-0",
            hasContent ? "cursor-pointer" : "cursor-default opacity-50"
          )}
          onClick={() => hasContent && onToggle()}
          disabled={!hasContent}
        >
          {hasContent ? (
            <ChevronRight
              className={cn(
                "w-4 h-4 transition-transform duration-200",
                isUnassigned ? "text-amber-500/70" : "text-[rgba(var(--theme-500),0.7)]",
                isExpanded && "rotate-90"
              )}
            />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-border" />
          )}
        </button>

        {/* Content: breadcrumb or simple label */}
        {isUnassigned ? (
          <span className="text-xs font-medium text-amber-400 flex-1">
            Unassigned
          </span>
        ) : description ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-1 min-w-0">
                <BreadcrumbPath path={path} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs">
              <p className="text-xs">{description}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <BreadcrumbPath path={path} />
        )}

        {/* Action buttons - show on hover */}
        {hasActions && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {/* Generate Records button */}
            {onGenerateForTopic && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateForTopic(topicPath);
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Grid2X2Plus className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  Generate records
                </TooltipContent>
              </Tooltip>
            )}

            {/* Generate Sub-topics button */}
            {onGenerateSubtopics && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateSubtopics(topicPath);
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  Generate sub-topics
                </TooltipContent>
              </Tooltip>
            )}

            {/* Delete button */}
            {onDeleteTopic && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTopic(topicName);
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  Delete topic
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Record count and coverage indicator - hide when expanded with children */}
        <div className="flex items-center justify-end gap-2 shrink-0 ml-auto">
          {/* Loading indicator when generating */}
          {isGenerating && (
            <div className="flex items-center gap-1.5 text-[rgb(var(--theme-500))]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">
                {generatingProgress
                  ? `Generating... ${generatingProgress.completed}/${generatingProgress.total}`
                  : "Generating..."}
              </span>
            </div>
          )}
          {(!isExpanded || !hasChildren) && !isGenerating && (
            <>
              {totalCount > 0 ? (
                <>
                  <span className="text-xs tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {totalCount}
                  </span>
                  <CoverageIndicator
                    coveragePercentage={percentage}
                    recordCount={totalCount}
                  />
                </>
              ) : !isUnassigned ? (
                <span className="text-xs text-muted-foreground/60 italic">
                  No records yet
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
      {/* Shared system prompt — shown once per topic group instead of per-record */}
      {systemPrompt && !isUnassigned && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="px-3 pb-1.5 -mt-0.5 bg-muted/60 border-l-2 border-l-[rgba(var(--theme-500),0.4)]">
              <p className="text-[10px] font-mono truncate leading-tight pl-6 cursor-help">
                <span className="text-muted-foreground/50">SYS: </span>
                {systemPromptSegments ? systemPromptSegments.map((seg, i) => (
                  <span key={i} className={cn(
                    seg.type === 'template' && 'text-muted-foreground/50',
                    (seg.type === 'topicName' || seg.type === 'currentTopicName')
                      && 'text-[rgba(var(--theme-500),0.7)]',
                  )}>
                    {seg.text}
                  </span>
                )) : (
                  <span className="text-muted-foreground/50">{systemPrompt}</span>
                )}
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-md">
            {systemPromptSegments ? (
              <p className="text-xs font-mono whitespace-pre-wrap">
                {systemPromptSegments.map((seg, i) => (
                  <span key={i} className={cn(
                    seg.type === 'template' && 'text-muted-foreground',
                    seg.type === 'topicName' && 'text-[rgb(var(--theme-500))]',
                    seg.type === 'currentTopicName' && 'text-[rgb(var(--theme-500))] font-semibold underline underline-offset-2',
                  )}>
                    {seg.text}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-xs font-mono whitespace-pre-wrap">{systemPrompt}</p>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}
