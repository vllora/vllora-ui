/**
 * ExpandTraceDialog
 *
 * Dialog for viewing and editing trace/record data in JSON format.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import type { DatasetRecord } from "@/types/dataset-types";

interface ExpandTraceDialogProps {
  record: DatasetRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (recordId: string, data: unknown) => Promise<void>;
}

export function ExpandTraceDialog({
  record,
  onOpenChange,
  onSave,
}: ExpandTraceDialogProps) {
  const [editedJson, setEditedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize JSON when record changes
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
      <DialogContent className="max-w-4xl h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Trace Data</DialogTitle>
          <DialogDescription>
            {record?.topic && (
              <span className="text-[rgb(var(--theme-500))]">Topic: {record.topic}</span>
            )}
            {record?.topic && " • "}
            Added {record && new Date(record.createdAt).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
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
          <div className="text-xs text-red-500 px-1">
            Invalid JSON: {jsonError}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
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
