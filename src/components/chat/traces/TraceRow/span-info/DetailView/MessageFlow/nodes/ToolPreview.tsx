import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";

interface ToolPreviewProps {
  toolInfo: Record<string, any>;
  maxChars?: number;
  className?: string;
}

export const ToolPreview = ({ toolInfo, maxChars = 25, className = "" }: ToolPreviewProps) => {
  if (!toolInfo) {
    return null;
  }

  const description = toolInfo.function?.description || toolInfo.description || '';
  const parameters = toolInfo.function?.parameters || toolInfo.parameters;
  const toolName = toolInfo.function?.name || toolInfo.name || '';
    

  // Single line truncated preview
  const firstLine = description.split('\n')[0];
  const truncatedContent = firstLine.length > maxChars ? firstLine.slice(0, maxChars) + "..." : firstLine;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className={`nopan mt-1.5 flex items-center justify-between gap-2 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors ${className}`}
          onClick={handleClick}
          onMouseDown={handleClick}
        >
          {truncatedContent && <span className="truncate">{truncatedContent}</span>}
          <Info className="w-3 h-3 flex-shrink-0" />
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] max-h-[80vh] overflow-hidden flex flex-col  border-[#30363d]">
        <DialogHeader className="pb-3 border-b border-[#30363d]">
          <DialogTitle className="text-zinc-200">{toolName || 'Tool Definition'}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 py-4 space-y-4">
          {description && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1">Description</div>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">{description}</div>
            </div>
          )}
          {parameters && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1">Parameters</div>
              <div className="text-xs">
                <JsonViewer data={parameters} collapsed={10} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
