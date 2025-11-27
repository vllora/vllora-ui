import React from 'react';

interface ImageWithPreviewProps {
  src: string;
  alt: string;
  onClick?: () => void;
}

export const ImageWithPreview: React.FC<ImageWithPreviewProps> = ({ src, alt, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="relative cursor-pointer hover:opacity-90 transition-opacity"
  >
    <img
      src={src}
      alt={alt}
      className="max-w-md rounded-lg border border-border"
    />
  </button>
);
