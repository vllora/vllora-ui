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
// Component
// ============================================================================

export function LucyImageRenderer({ imageParts }: LucyImageRendererProps) {
  if (!imageParts || imageParts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {imageParts.map((part, idx) => {
        const imageData = part.data;
        let src = '';

        if (typeof imageData === 'string') {
          src = imageData;
        } else if (imageData?.base64) {
          const mimeType = imageData.mimeType || 'image/png';
          src = `data:${mimeType};base64,${imageData.base64}`;
        } else if (imageData?.url) {
          src = imageData.url;
        }

        if (!src) return null;

        return (
          <img
            key={idx}
            src={src}
            alt={imageData?.name || `Image ${idx + 1}`}
            className="max-w-xs max-h-48 rounded-lg border object-contain"
          />
        );
      })}
    </div>
  );
}

export default LucyImageRenderer;
