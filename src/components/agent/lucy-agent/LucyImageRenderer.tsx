/**
 * LucyImageRenderer
 *
 * Renders image parts from messages with lightbox preview.
 */

import { useState } from 'react';
import { X } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface LucyImageRendererProps {
  imageParts: Array<{ part_type: 'image'; data: any }>;
}

// ============================================================================
// Helper to extract image src
// ============================================================================

function getImageSrc(imageData: any): string {
  if (typeof imageData === 'string') {
    return imageData;
  } else if (imageData?.type === 'bytes' && imageData?.data) {
    // Handle { type: 'bytes', data: 'base64...', mime_type: 'image/png' }
    const mimeType = imageData.mime_type || 'image/png';
    return `data:${mimeType};base64,${imageData.data}`;
  } else if (imageData?.base64) {
    // Handle { base64: '...', mimeType: 'image/png' }
    const mimeType = imageData.mimeType || 'image/png';
    return `data:${mimeType};base64,${imageData.base64}`;
  } else if (imageData?.url) {
    return imageData.url;
  } else if (imageData?.type === 'url' && imageData?.data) {
    // Handle { type: 'url', data: 'https://...' }
    return imageData.data;
  }
  return '';
}

// ============================================================================
// Component
// ============================================================================

export function LucyImageRenderer({ imageParts }: LucyImageRendererProps) {
  const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string } | null>(null);
  const [imageError, setImageError] = useState(false);

  if (!imageParts || imageParts.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {imageParts.map((part, idx) => {
          const imageData = part.data;
          const src = getImageSrc(imageData);
          const alt = (typeof imageData === 'object' && imageData?.name) || `Image ${idx + 1}`;


          if (!src) return null;

          return (
            <img
              key={idx}
              src={src}
              alt={alt}
              className="max-w-full max-h-48 rounded-lg border border-border/50 object-contain cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => {
                console.log('=== Opening lightbox with src:', src.substring(0, 100), '... length:', src.length);
                setImageError(false);
                setSelectedImage({ src, alt });
              }}
            />
          );
        })}
      </div>

      {/* Image Lightbox Dialog */}
      {selectedImage && (() => {
        console.log('=== Lightbox rendering, selectedImage src:', selectedImage.src.substring(0, 100), '... length:', selectedImage.src.length);
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Image container */}
          <div
            className="relative flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {imageError ? (
              <div className="p-8 bg-zinc-800 rounded-lg text-zinc-400">
                Failed to load image
              </div>
            ) : (
              <img
                src={selectedImage.src}
                alt={selectedImage.alt}
                className="max-w-[90vw] max-h-[85vh] min-w-[100px] min-h-[100px] object-contain rounded-lg shadow-2xl bg-zinc-800"
                onLoad={() => console.log('=== Image loaded successfully')}
                onError={() => {
                  console.error('Failed to load preview image:', selectedImage.src.substring(0, 100));
                  setImageError(true);
                }}
              />
            )}
            {/* Image name */}
            {selectedImage.alt && selectedImage.alt !== 'Image 1' && !imageError && (
              <p className="absolute bottom-0 left-0 right-0 text-center text-sm text-zinc-400 bg-black/50 py-2 rounded-b-lg">
                {selectedImage.alt}
              </p>
            )}
          </div>
        </div>
        );
      })()}
    </>
  );
}

export default LucyImageRenderer;
