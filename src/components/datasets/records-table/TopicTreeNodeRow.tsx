/**
 * TopicTreeNodeRow
 *
 * Renders a single node in the topic record tree with breadcrumb path display.
 * Used by TopicRecordTree to display hierarchical topic groupings.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MessageSquareText, Copy, Check } from "lucide-react";
import { DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { cn } from "@/lib/utils";
import { RecordRow } from "./RecordRow";
import { TopicNodeHeader } from "./TopicNodeHeader";
import type { AvailableTopic } from "../record-utils";
import { buildTopicSystemPrompt, buildAccumulatedPromptSegments, type PromptTextSegment } from "@/lib/distri-finetune-tools/steps/shared/topic-system-prompt";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// Re-export for convenience
export { TopicNodeHeader } from "./TopicNodeHeader";
export type { TopicNodeHeaderProps } from "./TopicNodeHeader";

export interface TopicTreeNodeRowProps {
  node: TopicHierarchyNode;
  depth: number;
  parentPath: string[];
  recordsByTopic: Map<string, DatasetRecord[]>;
  descendantCounts: Map<string, number>;
  /** Total records count for percentage calculation */
  totalRecords: number;
  onUpdateTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDelete: (recordId: string) => void;
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  selectable: boolean;
  selectedIds: Set<string>;
  onSelectRecord: (recordId: string, checked: boolean) => void;
  onExpand?: (record: DatasetRecord) => void;
  viewingRecordId?: string | null;
  availableTopics: AvailableTopic[];
  /** Handler for deleting a topic */
  onDeleteTopic?: (topicName: string) => void;
  /** Handler for generating records for a topic */
  onGenerateForTopic?: (topicPath: string) => void;
  /** Handler for generating subtopics (null = root level) */
  onGenerateSubtopics?: (topicPath: string | null) => void;
  /** ID of record to highlight (for variant source navigation) */
  highlightedRecordId?: string | null;
  /** Callback to set record ref for scrolling */
  setRecordRef?: (recordId: string) => (el: HTMLDivElement | null) => void;
  /** Topic name currently being generated (for loading indicator) */
  generatingTopic?: string | null;
  /** Progress of data generation (completed/total) */
  generatingProgress?: { completed: number; total: number } | null;
  /** Dataset training objective (for computing shared system prompts per topic) */
  datasetObjective?: string;
  /** Accumulated descriptions from parent topics (for prompt construction) */
  parentDescriptions?: (string | undefined)[];
}

/** Check if a target topic exists anywhere in a node's subtree */
function hasDescendant(node: TopicHierarchyNode, targetId: string, targetName: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.id === targetId || child.name === targetId || child.name === targetName) return true;
    if (hasDescendant(child, targetId, targetName)) return true;
  }
  return false;
}

// ============================================================================
// SystemPromptCard — Annotated system prompt showing how topic hierarchy
// and training objective map to parts of the prompt. Three highlight types:
//   • Goal (training objective) — italic
//   • Topics (hierarchy names) — blue family, leaf = bold
//   • Template text — dim
// Hover any segment to see a tooltip explaining what it represents.
// ============================================================================

/** Style config for the three highlighted segment types */
const SEGMENT_STYLES = {
  goal: {
    badge: 'text-muted-foreground/70 border-border/50 bg-muted/30 italic',
    hover: 'hover:bg-foreground/10 rounded-[3px] transition-colors cursor-default py-0.5',
  },
  topic: {
    text: 'text-blue-400',
    badge: 'text-blue-400 border-blue-500/25 bg-blue-500/10',
    hover: 'hover:bg-blue-500/15 rounded-[3px] transition-colors cursor-default py-0.5',
  },
  leafTopic: {
    text: 'text-blue-300',
    badge: 'text-blue-300 border-blue-400/30 bg-blue-400/10',
    hover: 'hover:bg-blue-400/15 rounded-[3px] transition-colors cursor-default py-0.5',
  },
} as const;

function SystemPromptCard({
  systemPrompt,
  systemPromptSegments,
  topicPath,
}: {
  systemPrompt: string;
  systemPromptSegments?: PromptTextSegment[];
  /** The topic hierarchy path (human-readable names) for the legend */
  topicPath: string[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [systemPrompt]);

  return (
    <div className="mx-3 mt-1.5 mb-2 rounded-md border border-border/50 bg-muted/20 overflow-hidden">
      {/* Header bar with copy button */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <MessageSquareText className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            System Prompt
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted transition-colors text-muted-foreground/50 hover:text-muted-foreground"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Prompt content */}
      <div className="px-3 py-2.5">
        {systemPromptSegments ? (
          <>
            {/* Flowing paragraph with highlighted segments + hover tooltips */}
            <TooltipProvider delayDuration={200}>
              <p className="text-[11px] leading-[1.8] whitespace-pre-wrap">
                {systemPromptSegments.map((seg, i) => {
                  // Goal (training objective) — italic with hover tooltip
                  if (seg.type === 'goal') {
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <span className={cn("italic text-foreground/60 px-0.5 -mx-0.5", SEGMENT_STYLES.goal.hover)}>
                            {seg.text}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[300px] p-0 overflow-hidden">
                          <div className="flex items-start gap-2 px-3 py-2.5">
                            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-foreground/40" />
                            <div>
                              <p className="text-foreground/90 leading-snug">
                                Sets the model&apos;s <span className="font-medium">role and persona</span>
                              </p>
                              <p className="text-muted-foreground mt-1 leading-snug">
                                Pulled from <span className="italic">Dataset → Objective</span>
                              </p>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  // Topic names from the hierarchy — blue color + superscript + hover tooltip
                  if (seg.topicDepth != null) {
                    const isLeaf = seg.type === 'currentTopicName';
                    const style = isLeaf ? SEGMENT_STYLES.leafTopic : SEGMENT_STYLES.topic;
                    // Build breadcrumb: show path up to this depth
                    const breadcrumb = topicPath.slice(0, seg.topicDepth + 1).map(t => t.replace(/_/g, ' '));
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            "px-0.5 -mx-0.5",
                            style.text,
                            style.hover,
                            isLeaf && 'font-semibold',
                          )}>
                            {seg.text}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[300px] p-0 overflow-hidden">
                          <div className="flex items-start gap-2 px-3 py-2.5">
                            <span className={cn("shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full", isLeaf ? 'bg-blue-300' : 'bg-blue-400')} />
                            <div>
                              <p className="text-foreground/90 leading-snug">
                                {isLeaf
                                  ? <>Narrows focus to <span className={cn("font-medium", style.text)}>{breadcrumb[breadcrumb.length - 1]}</span> — shared by all records here</>
                                  : <>Narrows focus to <span className={cn("font-medium", style.text)}>{breadcrumb[breadcrumb.length - 1]}</span></>
                                }
                              </p>
                              <p className="text-muted-foreground mt-1 leading-snug">
                                {breadcrumb.map((crumb, ci) => (
                                  <span key={ci}>
                                    {ci > 0 && <span className="mx-0.5 opacity-40">›</span>}
                                    <span className={ci === breadcrumb.length - 1 ? cn('font-medium', style.text) : ''}>
                                      {crumb}
                                    </span>
                                  </span>
                                ))}
                              </p>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  // Template text — dim, no tooltip
                  return (
                    <span key={i} className="text-foreground/60">
                      {seg.text}
                    </span>
                  );
                })}
              </p>
            </TooltipProvider>
          </>
        ) : (
          <p className="text-[11px] leading-relaxed whitespace-pre-wrap">
            <span className="text-muted-foreground/70">{systemPrompt}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function TopicTreeNodeRow({
  node,
  depth,
  parentPath,
  recordsByTopic,
  descendantCounts,
  totalRecords,
  onUpdateTopic,
  onDelete,
  onSave,
  selectable,
  selectedIds,
  onSelectRecord,
  onExpand,
  viewingRecordId,
  availableTopics,
  onDeleteTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  highlightedRecordId,
  setRecordRef,
  generatingTopic,
  generatingProgress,
  datasetObjective,
  parentDescriptions = [],
}: TopicTreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true); // Expand all by default
  const [isHighlightedTopic, setIsHighlightedTopic] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  // Listen for focus-topic events from canvas "View in Table" button
  useEffect(() => {
    const handleFocus = (e: Event) => {
      const { topicId, topicName } = (e as CustomEvent).detail ?? {};
      if (!topicId) return;

      const isTarget = topicId === node.id || topicId === node.name || topicName === node.name;
      const isAncestor = hasDescendant(node, topicId, topicName || "");
      // Check if this node is a direct child of the target (expand one child level)
      const parentName = parentPath.length > 0 ? parentPath[parentPath.length - 1] : null;
      const isDirectChildOfTarget = parentName != null &&
        (parentName === topicId || parentName === topicName);

      if (isTarget) {
        // This is the focused topic — expand, highlight header, scroll into view
        setIsExpanded(true);
        setIsHighlightedTopic(true);
        setTimeout(() => {
          headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        setTimeout(() => setIsHighlightedTopic(false), 2500);
      } else if (isAncestor || isDirectChildOfTarget) {
        // Target is a descendant, or this is a direct child of the target — expand
        setIsExpanded(true);
      } else {
        // Unrelated topic — collapse
        setIsExpanded(false);
      }
    };
    window.addEventListener("vllora_focus_topic", handleFocus);
    return () => window.removeEventListener("vllora_focus_topic", handleFocus);
  }, [node]);

  const hasChildren = node.children && node.children.length > 0;
  // Records can be keyed by either node.id or node.name, try both
  const recordsById = recordsByTopic.get(node.id) || [];
  const recordsByName = node.id !== node.name ? (recordsByTopic.get(node.name) || []) : [];
  const directRecords = [...recordsById, ...recordsByName];
  const hasRecords = directRecords.length > 0;
  const hasContent = hasChildren || hasRecords;
  const totalCount = descendantCounts.get(node.id) || 0;
  const percentage = totalRecords > 0 ? (totalCount / totalRecords) * 100 : 0;

  // Build the full path and descriptions including this node
  const currentPath = [...parentPath, node.name];
  const currentDescriptions = [...parentDescriptions, node.description];

  // Compute shared system prompt for leaf topics (only leaves have direct records)
  const systemPrompt = useMemo(() => {
    if (!datasetObjective || hasChildren) return undefined;
    return buildTopicSystemPrompt(currentPath, datasetObjective, currentDescriptions);
  }, [datasetObjective, hasChildren, currentPath, currentDescriptions]);

  // Compute structured prompt segments for color-coded rendering
  const systemPromptSegments = useMemo(() => {
    if (!datasetObjective || hasChildren) return undefined;
    return buildAccumulatedPromptSegments(currentPath, node.name, datasetObjective, currentDescriptions);
  }, [datasetObjective, hasChildren, currentPath, node.name, currentDescriptions]);

  return (
    <div className="relative">
      <div ref={headerRef}>
        <TopicNodeHeader
          path={currentPath}
          description={node.description}
          hasContent={hasContent}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded(!isExpanded)}
          totalCount={totalCount}
          percentage={percentage}
          hasChildren={!!hasChildren}
          onDeleteTopic={onDeleteTopic}
          onGenerateForTopic={onGenerateForTopic}
          onGenerateSubtopics={onGenerateSubtopics}
          isGenerating={node.name === generatingTopic}
          generatingProgress={node.name === generatingTopic ? generatingProgress : undefined}
          highlighted={isHighlightedTopic}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="bg-transparent">
          {/* System prompt card — shown for expanded leaf topics */}
          {systemPrompt && !hasChildren && (
            <SystemPromptCard
              systemPrompt={systemPrompt}
              systemPromptSegments={systemPromptSegments}
              topicPath={currentPath}
            />
          )}

          {/* Child nodes */}
          {hasChildren &&
            node.children!.map((child) => (
              <TopicTreeNodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                parentPath={currentPath}
                recordsByTopic={recordsByTopic}
                descendantCounts={descendantCounts}
                totalRecords={totalRecords}
                onUpdateTopic={onUpdateTopic}
                onDelete={onDelete}
                onSave={onSave}
                selectable={selectable}
                selectedIds={selectedIds}
                onSelectRecord={onSelectRecord}
                onExpand={onExpand}
                viewingRecordId={viewingRecordId}
                availableTopics={availableTopics}
                onDeleteTopic={onDeleteTopic}
                onGenerateForTopic={onGenerateForTopic}
                onGenerateSubtopics={onGenerateSubtopics}
                highlightedRecordId={highlightedRecordId}
                setRecordRef={setRecordRef}
                generatingTopic={generatingTopic}
                generatingProgress={generatingProgress}
                datasetObjective={datasetObjective}
                parentDescriptions={currentDescriptions}
              />
            ))}

          {/* Records at this node */}
          {hasRecords && (
            <div className="p-2 space-y-1">
              {directRecords.map((record) => (
                <RecordRow
                  key={record.id}
                  ref={setRecordRef?.(record.id)}
                  record={record}
                  onUpdateTopic={onUpdateTopic}
                  onDelete={onDelete}
                  onSave={onSave}
                  selectable={selectable}
                  selected={selectedIds.has(record.id)}
                  onSelect={(checked) => onSelectRecord(record.id, checked)}
                  onExpand={onExpand}
                  isViewing={viewingRecordId === record.id}
                  availableTopics={availableTopics}
                  hideTopic
                  isHighlighted={highlightedRecordId === record.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
