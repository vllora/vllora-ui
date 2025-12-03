import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { ContentItem, ImagePreviewDialog } from './content-items';

interface ContentArrayDisplayProps {
  contentArray: any[];
}

export const ContentArrayDisplay: React.FC<ContentArrayDisplayProps> = ({ contentArray }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const hasMultipleItems = contentArray.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {hasMultipleItems && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border/50 w-fit">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {contentArray.length} content blocks
          </span>
        </div>
      )}

      {contentArray.map((item, index) => (
        <ContentItem
          key={index}
          item={item}
          index={index}
          showBadge={hasMultipleItems}
          onPreview={setPreviewImage}
        />
      ))}

      <ImagePreviewDialog
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};
