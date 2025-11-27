import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import type { Tool } from "@/hooks/useExperiment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

interface ToolEditorDialogProps {
  tool: Tool;
  toolName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (toolJson: string) => void;
}

export function ToolEditorDialog({
  tool,
  toolName,
  isOpen,
  onOpenChange,
  onApply,
}: ToolEditorDialogProps) {
  const [draftContent, setDraftContent] = useState("");
  const [isValidJson, setIsValidJson] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftContent(JSON.stringify(tool, null, 2));
      setIsValidJson(true);
      setCopied(false);
    }
  }, [isOpen, tool]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draftContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContentChange = (content: string) => {
    setDraftContent(content);
    try {
      JSON.parse(content);
      setIsValidJson(true);
    } catch {
      setIsValidJson(false);
    }
  };

  const handleApply = () => {
    if (isValidJson) {
      onApply(draftContent);
      onOpenChange(false);
    }
  };

  const handleDiscard = () => {
    onOpenChange(false);
  };

  const originalContent = JSON.stringify(tool, null, 2);
  const hasChanges = draftContent !== originalContent;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold">
              {toolName}
            </DialogTitle>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mr-6"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied!" : "Copy JSON"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-4">
          <JsonEditor
            value={draftContent}
            onChange={handleContentChange}
            transparentBackground
            disableStickyScroll
          />
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleDiscard}>
            Discard
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!hasChanges || !isValidJson}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
