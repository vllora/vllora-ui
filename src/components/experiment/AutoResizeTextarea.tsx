import { useRef, useEffect } from "react";

interface AutoResizeTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  isExpanded: boolean;
  onNeedsExpandChange: (needsExpand: boolean) => void;
}

export function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
  isExpanded,
  onNeedsExpandChange,
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX_HEIGHT = 200; // pixels

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;

      // Check if content exceeds max height
      if (scrollHeight > MAX_HEIGHT && !isExpanded) {
        onNeedsExpandChange(true);
        textarea.style.height = `${MAX_HEIGHT}px`;
        textarea.style.overflowY = 'auto';
      } else if (isExpanded) {
        onNeedsExpandChange(true);
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = 'hidden';
      } else {
        onNeedsExpandChange(false);
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = 'hidden';
      }
    }
  }, [value, isExpanded, onNeedsExpandChange]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      rows={3}
    />
  );
}
