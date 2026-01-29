/**
 * ExpandedTopicNode
 *
 * Expanded state display for a topic node.
 * Shows header with resizable container and embedded RecordsTable.
 */

import { useState } from "react";
import { NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { RecordsTable } from "../../records-table";
import { TopicNodeHeader, HEADER_HEIGHT } from "../TopicNodeHeader";
import type { DatasetRecord } from "@/types/dataset-types";
import type { AvailableTopic } from "../../record-utils";

interface ExpandedTopicNodeProps {
  name: string;
  recordCount: number;
  isRoot: boolean;
  isSelected: boolean;
  isReactFlowSelected: boolean;
  /** Coverage percentage from coverageStats (0-100) */
  coveragePercentage?: number;
  records: DatasetRecord[];
  datasetId?: string;
  availableTopics: AvailableTopic[];
  onViewRecords: () => void;
  onResize: (width: number, height: number) => void;
  onRename?: (newName: string) => void;
  onUpdateRecordTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord?: (recordId: string) => void;
  onSaveRecord?: (recordId: string, data: unknown) => Promise<void>;
}

// Default and minimum sizes
export const DEFAULT_EXPANDED_WIDTH = 700;
export const DEFAULT_EXPANDED_HEIGHT = 500;
const MIN_WIDTH = 450;
const MIN_HEIGHT = 300;

export function ExpandedTopicNode({
  name,
  recordCount,
  isRoot,
  isSelected,
  isReactFlowSelected,
  coveragePercentage,
  records,
  datasetId,
  availableTopics,
  onViewRecords,
  onResize,
  onRename,
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
}: ExpandedTopicNodeProps) {
  // Track expanded size locally
  const [expandedSize, setExpandedSize] = useState({
    width: DEFAULT_EXPANDED_WIDTH,
    height: DEFAULT_EXPANDED_HEIGHT,
  });

  const handleResize = (_event: unknown, params: { width: number; height: number }) => {
    setExpandedSize({
      width: params.width,
      height: params.height,
    });
    onResize(params.width, params.height);
  };

  const tableHeight = expandedSize.height - HEADER_HEIGHT;

  return (
    <div
      className={cn(
        "rounded-xl border-[0.5px] transition-all bg-background",
        isSelected
          ? "border-[rgb(var(--theme-500))]"
          : "border-emerald-500/40 hover:border-emerald-500/50"
      )}
      style={{
        width: expandedSize.width,
        height: expandedSize.height,
        boxShadow: isSelected
          ? '0 0 15px rgba(16, 185, 129, 0.2), 0 0 30px rgba(16, 185, 129, 0.1)'
          : undefined,
      }}
    >
      {/* Resizer - visible only when node is selected */}
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        onResize={handleResize}
        isVisible={isReactFlowSelected}
        lineClassName="!border-transparent"
        handleClassName="!w-3 !h-3 !rounded-full !bg-[rgb(var(--theme-500))] !border-1 !border-background !shadow-md"
      />

      {/* Header */}
      <TopicNodeHeader
        name={name}
        recordCount={recordCount}
        isRoot={isRoot}
        isExpanded={true}
        coveragePercentage={coveragePercentage}
        onViewRecords={onViewRecords}
        onRename={onRename}
      />

      {/* RecordsTable */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="nowheel overflow-hidden"
        style={{ height: tableHeight, minWidth: 0 }}
      >
        <RecordsTable
          records={records}
          datasetId={datasetId}
          height={tableHeight}
          showFooter={false}
          emptyMessage="No records in this topic"
          onUpdateTopic={onUpdateRecordTopic || (async () => {})}
          onDelete={onDeleteRecord || (() => {})}
          onSave={onSaveRecord}
          availableTopics={availableTopics}
          
        />
      </div>
    </div>
  );
}
