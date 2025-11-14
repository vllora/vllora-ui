import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookmarkPlus, Copy } from "lucide-react";
import { VirtualModel } from "@/services/virtual-models-api";

interface ApplyVirtualModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualModel: VirtualModel | null;
  onApply: (mode: 'base' | 'copy') => void;
}

export function ApplyVirtualModelDialog({
  open,
  onOpenChange,
  virtualModel,
  onApply,
}: ApplyVirtualModelDialogProps) {
  if (!virtualModel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Virtual Model</DialogTitle>
          <DialogDescription>
            How would you like to apply "{virtualModel.name}"?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <button
            onClick={() => {
              onApply('base');
              onOpenChange(false);
            }}
            className="w-full p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-colors text-left"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-border shrink-0">
                <BookmarkPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">Use as Base Model</h3>
                <p className="text-xs text-muted-foreground">
                  Use this virtual model as the starting configuration. Any additional
                  changes you make in the form will be applied on top of this base.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              onApply('copy');
              onOpenChange(false);
            }}
            className="w-full p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-colors text-left"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-border shrink-0">
                <Copy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">Copy Configuration</h3>
                <p className="text-xs text-muted-foreground">
                  Copy the configuration from this virtual model to the form. You can
                  modify it freely without affecting the virtual model.
                </p>
              </div>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
