/**
 * DatasetDetailHeader
 *
 * Header showing dataset title and objective.
 * Consumes DatasetDetailContext for dataset data and mutations.
 */

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { EditableTitle } from "./EditableTitle";

export function DatasetDetailHeader() {
  const { dataset, handleRenameDataset, handleUpdateObjective } = DatasetDetailConsumer();
  const [isEditingObjective, setIsEditingObjective] = useState(false);
  const [objectiveValue, setObjectiveValue] = useState("");

  return (
    <div className="w-full flex flex-col">
      {/* Title row */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <EditableTitle
            value={dataset?.name ?? ""}
            onSave={handleRenameDataset}
          />
        </div>
      </div>

      {/* Objective */}
      {isEditingObjective ? (
        <div className="flex items-center gap-2">
          <Input
            value={objectiveValue}
            onChange={(e) => setObjectiveValue(e.target.value)}
            className="h-7 text-sm flex-1"
            placeholder="Describe the training objective..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleUpdateObjective(objectiveValue);
                setIsEditingObjective(false);
              }
              if (e.key === "Escape") setIsEditingObjective(false);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              handleUpdateObjective(objectiveValue);
              setIsEditingObjective(false);
            }}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setIsEditingObjective(false)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Objective:</span>{" "}
            {dataset?.datasetObjective || (
              <span className="italic text-muted-foreground/60">Not set</span>
            )}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => {
              setObjectiveValue(dataset?.datasetObjective ?? "");
              setIsEditingObjective(true);
            }}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
