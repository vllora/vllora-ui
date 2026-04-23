/**
 * RootNodeComponent
 *
 * Enhanced root node that shows the dataset objective, aggregate stats,
 * and overall quality. Wider pill shape instead of tiny circle.
 */

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { NetworkIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopicCanvasConsumer } from "./TopicCanvasContext";

export interface RootNodeData extends Record<string, unknown> {
  hasChildren: boolean;
}

export type RootNode = Node<RootNodeData, "root">;

export const RootNodeComponent = memo(function RootNodeComponent({
  data,
}: NodeProps<RootNode>) {
  const { hasChildren } = data;
  const {
    selectedTopic,
    setSelectedTopic,
    pendingAddParentId,
    startAddingTopic,
    datasetObjective,
    totalRecordCount,
    hierarchy,
    topicQualityScores,
  } = TopicCanvasConsumer();

  const isSelected = selectedTopic === "__root__";

  // Count topics
  const topicCount = hierarchy
    ? (() => {
        let count = 0;
        const walk = (nodes: typeof hierarchy) => {
          for (const n of nodes ?? []) {
            count++;
            if (n.children) walk(n.children);
          }
        };
        walk(hierarchy);
        return count;
      })()
    : 0;

  // Compute overall quality average from all topics
  const overallQuality = topicQualityScores
    ? (() => {
        let totalScore = 0;
        let totalEvaluated = 0;
        for (const q of Object.values(topicQualityScores)) {
          totalScore += q.avg * q.evaluated;
          totalEvaluated += q.evaluated;
        }
        return totalEvaluated > 0 ? { avg: totalScore / totalEvaluated, evaluated: totalEvaluated } : null;
      })()
    : null;

  const handleSelect = () => {
    setSelectedTopic("__root__");
  };

  // Truncate objective for display
  const displayObjective = datasetObjective
    ? (datasetObjective.length > 30 ? `${datasetObjective.slice(0, 28)}…` : datasetObjective)
    : "Dataset";

  return (
    <div
      onClick={handleSelect}
      className="relative cursor-pointer"
    >
      <div
        className={cn(
          "rounded-xl border-[1px] px-4 py-2.5 transition-all",
          "bg-[#111113]",
          isSelected
            ? "border-[rgb(var(--theme-500))]"
            : "border-[rgba(var(--theme-500),0.3)] hover:border-[rgba(var(--theme-500),0.7)]"
        )}
        style={{
          width: 200,
          boxShadow: isSelected
            ? '0 0 15px rgba(var(--theme-500), 0.3), 0 0 30px rgba(var(--theme-500), 0.15)'
            : undefined,
        }}
      >
        {/* Title row: icon + objective */}
        <div className="flex items-center gap-2">
          <NetworkIcon className="w-4 h-4 text-[rgb(var(--theme-500))] shrink-0" />
          <span className="text-sm font-semibold text-[rgb(var(--theme-500))] truncate">
            {displayObjective}
          </span>
        </div>

        {/* Stats row */}
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <span className="tabular-nums">{totalRecordCount} records</span>
          <span>·</span>
          <span className="tabular-nums">{topicCount} topics</span>
          {overallQuality && (
            <>
              <span>·</span>
              <span className={cn(
                "tabular-nums font-medium",
                overallQuality.avg >= 0.8 ? "text-emerald-500" :
                overallQuality.avg >= 0.6 ? "text-amber-500" : "text-red-500"
              )}>
                {overallQuality.avg.toFixed(2)} avg
              </span>
            </>
          )}
        </div>
      </div>

      {/* Output handle - Right side */}
      {(hasChildren || pendingAddParentId === null) && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-1.5 !h-1.5 !bg-[rgba(var(--theme-500),0.5)] !border-0 !min-w-0 !min-h-0"
        />
      )}

      {/* Floating + button for adding child topic */}
      {isSelected && pendingAddParentId === undefined && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startAddingTopic(null);
          }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 translate-x-full w-6 h-6 rounded-md border border-border bg-background text-muted-foreground flex items-center justify-center hover:border-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-500))] hover:bg-[rgba(var(--theme-500),0.1)] transition-colors nodrag nopan"
          title="Add child topic"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});
