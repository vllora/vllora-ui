/**
 * DeleteConfirmationDialog
 *
 * Reusable confirmation dialog for deleting datasets or records.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DeleteConfirmation {
  type: "dataset" | "record";
  id: string;
  datasetId?: string;
  name?: string; // Optional name for display
}

interface DeleteConfirmationDialogProps {
  confirmation: DeleteConfirmation | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (confirmation: DeleteConfirmation) => void;
}

export function DeleteConfirmationDialog({
  confirmation,
  onOpenChange,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const isDataset = confirmation?.type === "dataset";

  return (
    <AlertDialog open={!!confirmation} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {isDataset ? "Dataset" : "Record"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDataset
              ? "This will permanently delete the dataset and all its records. This action cannot be undone."
              : "This will permanently delete this record. This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500 hover:bg-red-600"
            onClick={() => {
              if (confirmation) {
                onConfirm(confirmation);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
