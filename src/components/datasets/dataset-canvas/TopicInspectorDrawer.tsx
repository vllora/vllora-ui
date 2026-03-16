/**
 * TopicInspectorDrawer
 *
 * Bottom drawer that slides up when a topic is selected on the canvas.
 * 3-column layout: Info | Sources | Records
 * Resizable via drag handle. Can expand to full-view mode.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { X, GripHorizontal, Maximize2, Minimize2, FileText, MessageSquare, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { TopicSourceReferences } from "./TopicSourceReferences";
import { CompactRecordList } from "./CompactRecordList";
import { findTopicInHierarchy } from "../record-utils";
import { formatTopicName } from "./TopicNodeHeader";
import type { TopicHierarchyNode, DatasetRecord } from "@/types/dataset-types";

type FullViewTab = "records" | "sources";

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 200;
const FULL_VIEW_THRESHOLD = 0.6; // 60% of viewport height

export function TopicInspectorDrawer() {
  const {
    viewingTopicId,
    closeTopicModal,
    recordsByTopic,
    hierarchy,
    workflowId,
    topicQualityScores,
  } = TopicCanvasConsumer();

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isFullView, setIsFullView] = useState(false);
  const [fullViewTab, setFullViewTab] = useState<FullViewTab>("records");
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_HEIGHT);

  // Resolve topic info
  const { topicNode, topicRecords, displayName, sourceRefs } = useMemo(() => {
    if (!viewingTopicId) {
      return { topicNode: undefined, topicRecords: [], displayName: "", sourceRefs: [] as string[] };
    }

    const node = hierarchy ? findTopicInHierarchy(hierarchy, viewingTopicId) : undefined;
    const records = collectAllRecords(viewingTopicId, recordsByTopic, hierarchy);
    const refs = (node?.sourceChunkRefs ?? []) as string[];

    return {
      topicNode: node,
      topicRecords: records,
      displayName: formatTopicName(viewingTopicId),
      sourceRefs: refs,
    };
  }, [viewingTopicId, hierarchy, recordsByTopic]);

  // Quality score for this topic
  const quality = viewingTopicId ? topicQualityScores?.[viewingTopicId] : undefined;

  // Drag handle for resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - moveEvent.clientY;
      const newHeight = Math.max(MIN_HEIGHT, startHeight.current + delta);

      // Auto-switch to full view if dragged past threshold
      const viewportHeight = window.innerHeight;
      if (newHeight > viewportHeight * FULL_VIEW_THRESHOLD) {
        setIsFullView(true);
        isDragging.current = false;
      } else {
        setHeight(newHeight);
        setIsFullView(false);
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [height]);

  // Double-click to toggle full view
  const handleDoubleClick = useCallback(() => {
    setIsFullView(prev => !prev);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTopicModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTopicModal]);

  if (!viewingTopicId) return null;

  const drawerHeight = isFullView ? "80vh" : `${height}px`;

  return (
    <div
      className="border-t border-border bg-background shrink-0 flex flex-col overflow-hidden transition-[height] duration-200"
      style={{ height: drawerHeight }}
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-center py-1 cursor-ns-resize hover:bg-muted/30 transition-colors shrink-0"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <GripHorizontal className="w-5 h-5 text-muted-foreground/30" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{displayName}</h3>
        <span className="text-xs text-muted-foreground">
          {topicRecords.length} record{topicRecords.length !== 1 ? "s" : ""}
        </span>
        {quality && quality.evaluated > 0 && (
          <span className={cn(
            "text-xs font-medium tabular-nums",
            quality.avg >= 0.8 ? "text-emerald-500" : quality.avg >= 0.6 ? "text-amber-500" : "text-red-500"
          )}>
            {quality.avg.toFixed(2)} avg
          </span>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setIsFullView(prev => !prev)}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          title={isFullView ? "Compact view" : "Full view"}
        >
          {isFullView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={closeTopicModal}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content: 3-column in compact mode, tabbed in full-view */}
      {isFullView ? (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 border-b border-border/50 shrink-0">
            <TabButton
              active={fullViewTab === "records"}
              icon={<LayoutList className="w-3.5 h-3.5" />}
              label={`Records (${topicRecords.length})`}
              onClick={() => setFullViewTab("records")}
            />
            <TabButton
              active={fullViewTab === "sources"}
              icon={<FileText className="w-3.5 h-3.5" />}
              label={`Sources (${sourceRefs.length})`}
              onClick={() => setFullViewTab("sources")}
            />
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {fullViewTab === "records" ? (
              topicRecords.length > 0 ? (
                <CompactRecordList records={topicRecords} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
                  No records yet
                </div>
              )
            ) : (
              sourceRefs.length > 0 ? (
                <div className="p-3">
                  <TopicSourceReferences sourceChunkRefs={sourceRefs} workflowId={workflowId} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 p-4">
                  <FileText className="w-6 h-6 mb-2" />
                  <span className="text-xs">No sources linked</span>
                </div>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Column 1: Info */}
          <div className="w-[260px] border-r border-border/50 overflow-y-auto shrink-0 p-3 space-y-3">
            <div>
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Description</span>
              <p className="text-xs text-foreground/80 mt-1">
                {topicNode?.description || "No description available"}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              <StatCell label="Records" value={topicRecords.length} />
              <StatCell label="Sources" value={sourceRefs.length} />
              {quality && (
                <>
                  <StatCell
                    label="Avg Score"
                    value={quality.evaluated > 0 ? quality.avg.toFixed(2) : "—"}
                    color={quality.avg >= 0.8 ? "emerald" : quality.avg >= 0.6 ? "amber" : "red"}
                  />
                  <StatCell label="Evaluated" value={`${quality.evaluated}/${quality.count}`} />
                </>
              )}
            </div>
          </div>

          {/* Column 2: Sources */}
          <div className="w-[300px] border-r border-border/50 overflow-y-auto shrink-0">
            {sourceRefs.length > 0 ? (
              <div className="p-2">
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-1 block mb-2">
                  Source Material
                </span>
                <TopicSourceReferences sourceChunkRefs={sourceRefs} workflowId={workflowId} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 p-4">
                <FileText className="w-6 h-6 mb-2" />
                <span className="text-xs">No sources linked</span>
              </div>
            )}
          </div>

          {/* Column 3: Records */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2 shrink-0">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                Sample Records
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {topicRecords.length > 0 ? (
                <CompactRecordList records={topicRecords} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
                  No records yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-[rgb(var(--theme-500))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly color?: "emerald" | "amber" | "red";
}) {
  return (
    <div className="px-2 py-1.5 rounded bg-muted/30">
      <span className="text-[10px] text-muted-foreground/60 block">{label}</span>
      <span className={cn(
        "text-sm font-medium",
        color === "emerald" ? "text-emerald-500"
          : color === "amber" ? "text-amber-500"
          : color === "red" ? "text-red-500"
          : "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}

/** Collect all records for a topic, including descendant topics */
function collectAllRecords(
  topicId: string,
  recordsByTopic: Record<string, DatasetRecord[]>,
  hierarchy?: TopicHierarchyNode[],
): DatasetRecord[] {
  const records: DatasetRecord[] = [];
  const directRecords = recordsByTopic[topicId];
  if (directRecords) records.push(...directRecords);

  // Also collect from child topics
  if (hierarchy) {
    const node = findTopicInHierarchy(hierarchy, topicId);
    if (node?.children) {
      const collectChildren = (children: TopicHierarchyNode[]) => {
        for (const child of children) {
          const childKey = child.id || child.name;
          const childRecords = recordsByTopic[childKey] ?? recordsByTopic[child.name];
          if (childRecords) records.push(...childRecords);
          if (child.children) collectChildren(child.children);
        }
      };
      collectChildren(node.children);
    }
  }

  return records;
}
