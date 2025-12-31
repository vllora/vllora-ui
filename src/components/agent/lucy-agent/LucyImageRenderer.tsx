/**
 * LucyImageRenderer
 *
 * Renders image parts from messages.
 */

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
  if (!imageParts || imageParts.length === 0) return null;

  return (
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
            className="max-w-full max-h-48 rounded-lg border border-border/50 object-contain"
          />
        );
      })}
    </div>
  );
}

export default LucyImageRenderer;
