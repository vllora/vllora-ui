/**
 * RecordDataDialog
 *
 * Dialog for viewing and editing record data in JSON format.
 * Supports inline topic editing and evaluation scoring.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";
import { cn } from "@/lib/utils";
import { TopicCell } from "./cells/TopicCell";
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
  onUpdateTopic,
  onUpdateEvaluation,
  availableTopics = [],
}: RecordDataDialogProps) {
  const [editedJson, setEditedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

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

  const handleTopicUpdate = async (topic: string, isNew?: boolean) => {
    if (!record || !onUpdateTopic) return;
    await onUpdateTopic(record.id, topic, isNew);
  };

  const handleEvaluationClick = async (score: number) => {
    if (!record || !onUpdateEvaluation) return;
    // If clicking the same score, clear it
    const newScore = record.evaluation?.score === score ? undefined : score;
    await onUpdateEvaluation(record.id, newScore);
  };

  const handleClose = () => {
    setEditedJson("");
    setJsonError(null);
    onOpenChange(false);
  };

  const currentScore = record?.evaluation?.score;
  const displayScore = hoveredStar ?? currentScore;

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Record</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Added {record && new Date(record.createdAt).toLocaleString()}
          </p>
        </DialogHeader>

        {/* Topic and Evaluation Row */}
        <div className="flex items-center gap-8 py-3 border-b border-border">
          {/* Topic */}
          {onUpdateTopic && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Topic:</span>
              <TopicCell
                topic={record?.topic}
                onUpdate={handleTopicUpdate}
                availableTopics={availableTopics}
                tableLayout
              />
            </div>
          )}

          {/* Evaluation */}
          {onUpdateEvaluation && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Evaluation:</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleEvaluationClick(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(null)}
                    className="p-0.5 transition-colors"
                  >
                    <Star
                      className={cn(
                        "w-5 h-5 transition-colors",
                        displayScore && star <= displayScore
                          ? "text-amber-500 fill-amber-500"
                          : "text-muted-foreground/30 hover:text-amber-500/50"
                      )}
                    />
                  </button>
                ))}
                {currentScore && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({currentScore}/5)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* JSON Editor */}
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
