import { Info, Layers } from "lucide-react";
import { MarkdownViewer } from "../../markdown-viewer";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Message } from "@/types/chat";
import { ContentArrayDisplay } from "@/components/chat/messages/ContentArrayDisplay";

interface NodeContentPreviewProps {
  rawMessage: Message;
  maxChars?: number;
  className?: string;
}

export const NodeContentPreview = ({ rawMessage, maxChars = 25, className = "" }: NodeContentPreviewProps) => {
  if (!rawMessage || !rawMessage.content) {
    return null;
  }

  const typeOfContent = typeof rawMessage.content
  const isStringContent = typeOfContent === 'string';
  const stringContent = isStringContent ? rawMessage.content as string : undefined
  const arrayContent = !isStringContent && Array.isArray(rawMessage.content) ? rawMessage.content as any[] : undefined

  const hasMultipleItems = !isStringContent && arrayContent

  // Single line truncated preview
  const firstLine = isStringContent && (rawMessage.content as string).split('\n')[0];
  const truncatedContent = firstLine ? (firstLine.length > maxChars ? firstLine.slice(0, maxChars) + "..." : firstLine) : "";

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
          {truncatedContent && <><span className="truncate">{truncatedContent}</span>
            <Info className="w-3 h-3 flex-shrink-0" /></>}

          {hasMultipleItems && <><div className="flex items-center gap-2 px-1 py-.5 rounded-md bg-muted/50 border border-border/50 w-fit">
            <Layers className="w-2 h-2 text-muted-foreground" />
            <span className="text-[9px] font-medium text-muted-foreground">
              {rawMessage.content.length} content blocks
            </span>
          </div> <Info className="w-3 h-3 flex-shrink-0" /></>}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] h-[95vh] flex flex-col">
           {arrayContent && <div className="overflow-y-auto flex-1 pr-2 pt-4"><ContentArrayDisplay contentArray={arrayContent}/></div>}
           {!arrayContent && stringContent && <div className="overflow-y-auto flex-1 pr-2 pt-4"><div className="text-foreground leading-relaxed whitespace-normal break-words text-sm"><MarkdownViewer message={stringContent} /> </div></div>}
          {/* <MarkdownViewer message={content} /> */}
      </DialogContent>
    </Dialog>
  );
};
