import React, { useState } from 'react';
import { Expand } from 'lucide-react';
import { MessageDisplay } from '../../MessageDisplay';
import { ContentTypeBadge } from '../ContentTypeBadge';
import { TextPreviewDialog } from './TextPreviewDialog';

const MAX_LINES = 3;

const countLines = (text: string): number => {
  return text ? text.split('\n').length : 0;
};

const getFirstNLines = (text: string, n: number): string => {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.slice(0, n).join('\n');
};

interface TextContentProps {
  content: string;
  showBadge?: boolean;
}

export const TextContent: React.FC<TextContentProps> = ({
  content,
  showBadge = false,
}) => {
  const [showDialog, setShowDialog] = useState(false);

  const lineCount = countLines(content);
  const hasMoreLines = lineCount > MAX_LINES;
  const displayContent = hasMoreLines ? getFirstNLines(content, MAX_LINES) : content;

  return (
    <div className={showBadge ? "border p-2 rounded" : ""}>
      {showBadge && (
        <div className="mb-2">
          <ContentTypeBadge type="text" />
        </div>
      )}
      <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
        <MessageDisplay message={displayContent} />
        {hasMoreLines && (
          <button
            onClick={() => setShowDialog(true)}
            className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all font-medium text-xs"
          >
            <Expand className="h-3.5 w-3.5" />
            View full content ({lineCount - MAX_LINES} more line{lineCount - MAX_LINES !== 1 ? 's' : ''})
          </button>
        )}
      </div>

      <TextPreviewDialog
        content={showDialog ? content : null}
        onClose={() => setShowDialog(false)}
      />
    </div>
  );
};
