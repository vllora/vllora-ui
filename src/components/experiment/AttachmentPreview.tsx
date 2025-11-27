import { useState } from "react";
import { X, FileAudio, FileIcon } from "lucide-react";
import type { Attachment } from "./message-editor-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-2 pt-3 pr-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.index}
          className="relative group"
        >
          {attachment.type === "image" && attachment.url && (
            <>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setPreviewImage(attachment.url!)}
                      className="w-16 h-16 rounded-md overflow-hidden border border-border bg-muted cursor-pointer hover:ring-2 hover:ring-[rgb(var(--theme-500))] transition-all"
                    >
                      <img
                        src={attachment.url}
                        alt="Attached image"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Click to view larger</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                type="button"
                onClick={() => onRemove(attachment.index)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}

          {attachment.type === "audio" && (
            <>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-16 h-16 rounded-md border border-border bg-muted flex flex-col items-center justify-center gap-1">
                      <FileAudio className="w-6 h-6 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">
                        {attachment.format || "audio"}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Audio: {attachment.format?.toUpperCase()}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                type="button"
                onClick={() => onRemove(attachment.index)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}

          {attachment.type === "file" && (
            <>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-16 h-16 rounded-md border border-border bg-muted flex flex-col items-center justify-center gap-1 p-1">
                      <FileIcon className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground text-center line-clamp-2 leading-tight">
                        {attachment.filename || "file"}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{attachment.filename || "File attachment"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                type="button"
                onClick={() => onRemove(attachment.index)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      ))}

      {/* Image preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          {previewImage && (
            <img
              src={previewImage}
              alt="Image preview"
              className="w-full h-full object-contain max-h-[85vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
