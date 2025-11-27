import React, { useState } from 'react';
import { MessageDisplay } from '../MessageDisplay';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface ContentArrayDisplayProps {
  contentArray: any[];
}

export const ContentArrayDisplay: React.FC<ContentArrayDisplayProps> = ({ contentArray }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Reusable image component with click-to-preview
  const ImageWithPreview = ({ src, alt }: { src: string; alt: string }) => (
    <button
      type="button"
      onClick={() => setPreviewImage(src)}
      className="relative cursor-pointer hover:opacity-90 transition-opacity"
    >
      <img
        src={src}
        alt={alt}
        className="max-w-md rounded-lg border border-border"
      />
    </button>
  );

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
