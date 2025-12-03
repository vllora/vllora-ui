import React from 'react';
import { ImageContent } from './ImageContent';
import { TextContent } from './TextContent';
import { JsonContent } from './JsonContent';

interface ContentItemProps {
  item: any;
  index: number;
  showBadge: boolean;
  onPreview: (src: string) => void;
}

export const ContentItem: React.FC<ContentItemProps> = ({
  item,
  index,
  showBadge,
  onPreview,
}) => {
  const type = item.type?.toLowerCase();
  const content = item.content || item.text;

  // Handle image_url type
  if (type === 'image_url' && item.image_url?.url) {
    return (
      <ImageContent
        src={item.image_url.url}
        index={index}
        showBadge={showBadge}
        onPreview={onPreview}
      />
    );
  }

  // Handle text type
  if (type === 'text' && content) {
    // Check if it's a base64 image
    if (typeof content === 'string' && content.startsWith('data:image/')) {
      return (
        <ImageContent
          src={content}
          index={index}
          showBadge={showBadge}
          onPreview={onPreview}
        />
      );
    }
    return (
      <TextContent
        content={content}
        showBadge={showBadge}
      />
    );
  }

  // Handle raw JSON objects
  if (!type && !content && typeof item === 'object' && item !== null) {
    return (
      <JsonContent
        data={item}
        showBadge={showBadge}
      />
    );
  }

  return null;
};
