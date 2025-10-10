import React from 'react';
import { MessageDisplay } from '../MessageDisplay';

interface ContentArrayDisplayProps {
  contentArray: any[];
}

export const ContentArrayDisplay: React.FC<ContentArrayDisplayProps> = ({ contentArray }) => {
  return (
    <div className="flex flex-col gap-3">
      {contentArray.map((item, index) => {
        const [type, content] = item;

        if (type === 'Text' && content) {
          // Check if it's a base64 image
          if (typeof content === 'string' && content.startsWith('data:image/')) {
            return (
              <div key={index} className="relative">
                <img
                  src={content}
                  alt={`Image ${index + 1}`}
                  className="max-w-md rounded-lg border border-neutral-800/30"
                />
              </div>
            );
          }

          // Regular text content
          return (
            <div key={index} className="text-neutral-100 leading-relaxed whitespace-normal break-words text-sm">
              <MessageDisplay message={content} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
