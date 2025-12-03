import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ImageWithPreviewProps {
  src: string;
  alt: string;
  onClick?: () => void;
}

export const ImageWithPreview: React.FC<ImageWithPreviewProps> = ({ src, alt, onClick }) => {
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    setHasError(true);
  };

  if (hasError) {
    return (
      <div className="flex items-center justify-center w-48 h-32 rounded-lg border border-border bg-muted">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageOff className="w-8 h-8" />
          <span className="text-xs">Failed to load image</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative cursor-pointer hover:opacity-90 transition-opacity"
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-96 rounded-lg border border-border object-contain"
        onError={handleError}
      />
    </button>
  );
};
