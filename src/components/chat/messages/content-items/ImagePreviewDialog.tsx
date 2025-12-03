import React from 'react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface ImagePreviewDialogProps {
  src: string | null;
  onClose: () => void;
}

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  src,
  onClose,
}) => (
  <Dialog open={!!src} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
      {src && (
        <img
          src={src}
          alt="Image preview"
          className="w-full h-full object-contain max-h-[85vh]"
        />
      )}
    </DialogContent>
  </Dialog>
);
