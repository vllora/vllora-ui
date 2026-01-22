/**
 * RecordDataDialog
 *
 * Dialog for viewing and editing record data with a 3-panel layout:
 * - Formatted thread panel (conversation view)
 * - Metadata panel (topic, tools, stats)
 * - JSON editor panel (raw data editing)
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, Info, Code } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import { FormattedThreadPanel } from "./cells/FormattedThreadPanel";
import { MetadataPanel } from "./cells/MetadataPanel";
import type { AvailableTopic } from "./record-utils";
import type { DatasetRecord } from "@/types/dataset-types";

interface RecordDataDialogProps {
  record: DatasetRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (recordId: string, data: unknown) => Promise<void>;
  onUpdateTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onUpdateEvaluation?: (recordId: string, score: number | undefined) => Promise<void>;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
}

export function RecordDataDialog({
  record,
  onOpenChange,
  onSave,
  availableTopics = [],
}: RecordDataDialogProps) {
  const [editedJson, setEditedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Get topic path from availableTopics
  const topicPath = useMemo(() => {
    if (!record?.topic) return null;
    const topic = availableTopics.find((t) => t.name === record.topic);
    return topic?.path || [record.topic];
  }, [record?.topic, availableTopics]);

  // Initialize state when record changes
  useEffect(() => {
    if (record) {
      setEditedJson(JSON.stringify(record.data, null, 2));
      setJsonError(null);
    }
  }, [record]);

  const handleJsonChange = (value: string) => {
    setEditedJson(value);
    try {
      if (value.trim()) {
        JSON.parse(value);
        setJsonError(null);
      }
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleSave = async () => {
    if (!record || jsonError) return;

    try {
      const parsedData = JSON.parse(editedJson);
      setIsSaving(true);
      await onSave(record.id, parsedData);
      handleClose();
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setEditedJson("");
    setJsonError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-7xl h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>Edit Record</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Added {record && new Date(record.createdAt).toLocaleString()}
          </p>
        </DialogHeader>

        {/* 3-Panel Layout */}
        <div className="flex-1 grid grid-cols-4 divide-x divide-border overflow-hidden">
          {/* Left Panel - Formatted Thread (2/4 width) */}
          <div className="col-span-2 flex flex-col overflow-hidden">
            <PanelHeader icon={MessageSquare} title="Formatted Thread" />
            <div className="flex-1 overflow-auto p-4">
              {record && <FormattedThreadPanel data={record.data} />}
            </div>
          </div>

          {/* Middle Panel - Metadata (1/4 width) */}
          <div className="col-span-1 flex flex-col overflow-hidden">
            <PanelHeader icon={Info} title="Definitions & Meta" />
            <div className="flex-1 overflow-auto p-4">
              {record && <MetadataPanel record={record} topicPath={topicPath} />}
            </div>
          </div>

          {/* Right Panel - JSON Editor (1/4 width) */}
          <div className="col-span-1 flex flex-col overflow-hidden">
            <PanelHeader icon={Code} title="JSON Data" />
            <div className="flex-1 overflow-hidden">
              {record && (
                <JsonEditor
                  value={editedJson}
                  onChange={handleJsonChange}
                  hideValidation={!jsonError}
                />
              )}
            </div>
            {jsonError && (
              <div className="text-xs text-red-500 px-4 py-2 border-t border-border bg-red-500/10">
                Invalid JSON: {jsonError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!!jsonError || isSaving}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PanelHeaderProps {
  icon: React.ElementType;
  title: string;
}

function PanelHeader({ icon: Icon, title }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}
