/**
 * CreateDatasetDialog
 *
 * Dialog for creating a new dataset.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";

export function CreateDatasetDialog() {
  const {
    createDatasetDialog,
    setCreateDatasetDialog,
    newDatasetName,
    setNewDatasetName,
    handleCreateDataset,
  } = DatasetDetailConsumer();

  return (
    <Dialog
      open={createDatasetDialog}
      onOpenChange={(open) => {
        setCreateDatasetDialog(open);
        if (!open) setNewDatasetName("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new dataset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            placeholder="Dataset name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newDatasetName.trim()) {
                handleCreateDataset();
              }
              if (e.key === "Escape") {
                setCreateDatasetDialog(false);
                setNewDatasetName("");
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreateDatasetDialog(false);
                setNewDatasetName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDataset}
              disabled={!newDatasetName.trim()}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
