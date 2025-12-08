import React from 'react';
import { FileText, Image, Braces } from 'lucide-react';

export type ContentType = 'text' | 'image' | 'json';

const config = {
  text: { icon: FileText, label: 'Text', color: 'text-blue-400 bg-blue-400/10' },
  image: { icon: Image, label: 'Image', color: 'text-green-400 bg-green-400/10' },
  json: { icon: Braces, label: 'JSON', color: 'text-amber-400 bg-amber-400/10' },
};

interface ContentTypeBadgeProps {
  type: ContentType;
}

export const ContentTypeBadge: React.FC<ContentTypeBadgeProps> = ({ type }) => {
  const { icon: Icon, label, color } = config[type];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};
