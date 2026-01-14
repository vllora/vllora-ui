/**
 * DatasetItem
 *
 * A single dataset item in the list view with expandable records.
 */

import { DatasetItemHeader } from "./DatasetItemHeader";
import { RecordsTable } from "./RecordsTable";
import type { DatasetRecord } from "@/types/dataset-types";

interface DatasetItemProps {
  datasetId: string;
  name: string;
  recordCount: number | string;
  updatedAt: number;
  records: DatasetRecord[];
  isExpanded: boolean;
  isLoadingRecords: boolean;
  isEditing: boolean;
  editingName: string;
  maxRecords: number;
  onToggle: () => void;
  onSelect: () => void;
  onEditNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onImport?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
  onUpdateRecordTopic: (recordId: string, topic: string) => Promise<void>;
  onDeleteRecord: (recordId: string) => void;
}

export function DatasetItem({
  datasetId,
  name,
  recordCount,
  updatedAt,
  records,
  isExpanded,
  isLoadingRecords,
  isEditing,
  editingName,
  maxRecords,
  onToggle,
  onSelect,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onImport,
  onDownload,
  onDelete,
  onUpdateRecordTopic,
  onDeleteRecord,
}: DatasetItemProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <DatasetItemHeader
        name={name}
        recordCount={recordCount}
        updatedAt={updatedAt}
        isExpanded={isExpanded}
        isEditing={isEditing}
        editingName={editingName}
        onToggle={onToggle}
        onSelect={onSelect}
        onEditNameChange={onEditNameChange}
        onSaveRename={onSaveRename}
        onCancelRename={onCancelRename}
        onStartRename={onStartRename}
        onImport={onImport}
        onDownload={onDownload}
        onDelete={onDelete}
      />

      {isExpanded && (
        <RecordsTable
          records={records}
          datasetId={datasetId}
          isLoading={isLoadingRecords}
          maxRecords={maxRecords}
          onSeeAll={onSelect}
          onUpdateTopic={onUpdateRecordTopic}
          onDelete={onDeleteRecord}
        />
      )}
    </div>
  );
}
