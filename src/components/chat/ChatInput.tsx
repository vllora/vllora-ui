import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type your message...',
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-border p-4 bg-card">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-secondary text-secondary-foreground placeholder-muted-foreground px-4 py-3 rounded-lg resize-none
            focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed
            max-h-[200px] overflow-y-auto border border-input"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 px-4 py-3 h-auto disabled:opacity-50"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground/70 mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
};