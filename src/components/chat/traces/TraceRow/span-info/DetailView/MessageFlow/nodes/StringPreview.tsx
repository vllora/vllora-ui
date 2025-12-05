import { Info } from "lucide-react";
import { MarkdownViewer } from "../../markdown-viewer";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StringPreviewProps {
  content: string;
  maxChars?: number;
  className?: string;
}

export const StringPreview = ({ content, maxChars = 25, className = "" }: StringPreviewProps) => {
  if (!content || content.trim().length === 0) {
    return null;
  }

  // Single line truncated preview
  const firstLine = content.split('\n')[0];
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
          <span className="truncate">{truncatedContent}</span>
          <Info className="w-3 h-3 flex-shrink-0" />
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto p-4 bg-[#161b22] border-[#30363d]">
        <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
          <MarkdownViewer message={content} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
