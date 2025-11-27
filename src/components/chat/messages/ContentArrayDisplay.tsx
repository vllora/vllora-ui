import React, { useState } from 'react';
import { MessageDisplay } from '../MessageDisplay';
import { ImageWithPreview } from './ImageWithPreview';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { JsonViewer } from '../traces/TraceRow/span-info/JsonViewer';

interface ContentArrayDisplayProps {
  contentArray: any[];
}

export const ContentArrayDisplay: React.FC<ContentArrayDisplayProps> = ({ contentArray }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {contentArray.map((item, index) => {
        const type = item.type?.toLowerCase();
        const content = item.content || item.text;

        // Handle image_url type
        if (type === 'image_url' && item.image_url?.url) {
          return (
            <div key={index} className="relative">
              <ImageWithPreview
                src={item.image_url.url}
                alt={`Image ${index + 1}`}
                onClick={() => setPreviewImage(item.image_url.url)}
              />
            </div>
          );
        }

        // Handle text type
        if (type === 'text' && content) {
          // Check if it's a base64 image
          if (typeof content === 'string' && content.startsWith('data:image/')) {
            return (
              <div key={index} className="relative">
                <ImageWithPreview
                  src={content}
                  alt={`Image ${index + 1}`}
                  onClick={() => setPreviewImage(content)}
                />
              </div>
            );
          }

          // Regular text content
          return (
            <div key={index} className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
              <MessageDisplay message={content} />
            </div>
          );
        }
        if(!type && !content && typeof item === 'object' && item !== null) {
          return <JsonViewer data={item} key={`json-${index}`} collapsed={10} />;
        }

        return null;
      })}

      {/* Image preview dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          {previewImage && (
            <img
              src={previewImage}
              alt="Image preview"
              className="w-full h-full object-contain max-h-[85vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
