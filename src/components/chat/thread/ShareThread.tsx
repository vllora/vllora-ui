import React, { useState } from "react";
import { ShareIcon } from "@heroicons/react/24/outline";
import { Check, Copy, ExternalLink, Globe, Lock, LockOpenIcon, Link2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Copy button with success state
const CopyButton = ({ value, className }: { value: string, className?: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10", className)}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

interface ShareThreadProps {
  threadId: string;
  projectId: string;
  modelName?: string;
  isPublic?: boolean;
}

export const ShareThread = ({
  threadId,
  projectId,
  modelName = "",
  isPublic = false,
}: ShareThreadProps) => {
  const [open, setOpen] = useState(false);
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [updateLoading, setUpdateLoading] = useState(false);
  const shareUrl = window.location.origin + "/sharing/threads/" + threadId;

  const handleVisibilityChange = async (checked: boolean) => {
    setUpdateLoading(true);
    try {
      // TODO: Implement API call to update thread visibility
      setLocalIsPublic(checked);
      toast.success("Thread is now " + (checked ? "public" : "private"));
    } catch (error) {
      toast.error("Failed to update thread visibility");
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                className="p-1.5 rounded-full hover:bg-zinc-800 focus:outline-none focus:ring-0 focus:bg-zinc-800 transition-all duration-200"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                {localIsPublic ? (
                  <Link2 className="w-3.5 h-3.5 text-primary hover:text-primary/80 transition-colors" />
                ) : (
                  <ShareIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-blue-400 transition-colors" />
                )}
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            className="bg-[#1a1a1a] border-border px-3 py-2 shadow-lg"
            sideOffset={4}
          >
            <div className="flex items-center gap-2">
              {localIsPublic ? (
                <>
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <p className="text-xs font-medium text-gray-200">View public thread link</p>
                    <p className="text-[10px] text-gray-400">Thread is currently public</p>
                  </div>
                </>
              ) : (
                <>
                  <ShareIcon className="h-3.5 w-3.5 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium text-gray-200">Share this thread</p>
                    <p className="text-[10px] text-gray-400">Thread is currently private</p>
                  </div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="bg-[#1a1a1a] border-border text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">Thread Visibility</DialogTitle>
          <DialogDescription className="text-gray-400">
            Control who can access and view this thread
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-gray-200 flex items-center gap-2">
                {localIsPublic ? (
                  <LockOpenIcon className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Lock className="h-4 w-4 text-gray-400" />
                )}
                {localIsPublic ? "Public" : "Private"} thread
              </Label>
              <p className="text-xs text-gray-400">
                {localIsPublic
                  ? "Anyone with the link can view this thread"
                  : "Only team members can view this thread"}
              </p>
            </div>
            <Switch
              checked={localIsPublic}
              onCheckedChange={handleVisibilityChange}
              disabled={updateLoading}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          {localIsPublic && (
            <div className="pt-4 border-t border-border space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-400" />
                  Public URL
                </div>
                <div className="flex items-center space-x-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    className="!bg-[#252525] !border-border text-gray-300 text-xs focus-visible:ring-violet-500 flex-1 truncate"
                  />
                  <CopyButton
                    value={shareUrl}
                    className="flex-shrink-0"
                  />
                </div>
              </div>

              <Button
                variant="default"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-2"
                onClick={() => {
                  window.open(shareUrl, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in new tab
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
