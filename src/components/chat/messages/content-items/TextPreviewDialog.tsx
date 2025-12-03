import React, { useState } from 'react';
import { FileText, Eye, Code, Copy, Check } from 'lucide-react';
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
} from '@/components/ui/tooltip';
import { MessageDisplay } from '../../MessageDisplay';

type ViewMode = 'markdown' | 'raw';

interface TextPreviewDialogProps {
  content: string | null;
  onClose: () => void;
}

export const TextPreviewDialog: React.FC<TextPreviewDialogProps> = ({
  content,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('markdown');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={!!content} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-medium">
              <div className="p-1.5 rounded-md bg-blue-400/10">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              Full Content
            </DialogTitle>
            <div className="flex items-center gap-2 mr-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'markdown'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'raw'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  Raw
                </button>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleCopy}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{copied ? 'Copied!' : 'Copy content'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-2 pt-4">
          {content && (
            viewMode === 'markdown' ? (
              <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
                <MessageDisplay message={content} />
              </div>
            ) : (
              <pre className="text-foreground text-sm font-mono whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-md">
                {content}
              </pre>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
