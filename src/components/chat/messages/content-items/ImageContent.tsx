import React from 'react';
import { ImageWithPreview } from '../ImageWithPreview';
import { ContentTypeBadge } from '../ContentTypeBadge';

interface ImageContentProps {
  src: string;
  index: number;
  showBadge?: boolean;
  onPreview?: (src: string) => void;
}

export const ImageContent: React.FC<ImageContentProps> = ({
  src,
  index,
  showBadge = false,
  onPreview,
}) => (
  <div className={showBadge ? "border p-3 rounded overflow-hidden" : ""}>
    {showBadge && (
      <div className="mb-2">
        <ContentTypeBadge type="image" />
      </div>
    )}
    <div className="max-w-full overflow-hidden">
      <ImageWithPreview
        src={src}
        alt={`Image ${index + 1}`}
        onClick={() => onPreview?.(src)}
      />
    </div>
  </div>
);
