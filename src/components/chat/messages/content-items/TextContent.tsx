import React, { useState, useMemo } from 'react';
import { Expand } from 'lucide-react';
import { ContentTypeBadge } from '../ContentTypeBadge';
import { TextPreviewDialog } from './TextPreviewDialog';

interface TextContentProps {
  content: string;
  showBadge?: boolean;
}

// Truncate to ~3 lines worth of characters (roughly 200 chars)
const MAX_PREVIEW_LENGTH = 200;

export const TextContent: React.FC<TextContentProps> = ({
  content,
  showBadge = false,
}) => {
  const [showDialog, setShowDialog] = useState(false);

  // Simple truncation: show plain text preview, full formatted content in dialog
  const { previewText, isTruncated } = useMemo(() => {
    const trimmed = content.trim();
    if (trimmed.length <= MAX_PREVIEW_LENGTH) {
      return { previewText: trimmed, isTruncated: false };
    }
    // Truncate at word boundary if possible
    const truncated = trimmed.slice(0, MAX_PREVIEW_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    const preview = lastSpace > MAX_PREVIEW_LENGTH * 0.7
      ? truncated.slice(0, lastSpace)
      : truncated;
    return { previewText: preview + '…', isTruncated: true };
  }, [content]);

  return (
    <div className={showBadge ? "border p-2 rounded" : ""}>
      {showBadge && (
        <div className="mb-2">
          <ContentTypeBadge type="text" />
        </div>
      )}
      <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
        <p className="whitespace-pre-wrap line-clamp-3">{previewText}</p>
        {isTruncated && (
          <button
            onClick={() => setShowDialog(true)}
            className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all font-medium text-xs"
          >
            <Expand className="h-3.5 w-3.5" />
            View full content
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
