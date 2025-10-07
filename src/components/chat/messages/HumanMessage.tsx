import React, { useState } from 'react';
import { Copy, Check, Clock } from 'lucide-react';
import { Message } from '@/types/chat';
import { MessageDisplay } from '../MessageDisplay';
import { formatMessageTime } from '@/utils/dateUtils';
import { AvatarItem } from './AvatarItem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HumanMessageProps {
  message: Message;
}

export const HumanMessage: React.FC<HumanMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      console.warn('Clipboard API not available');
      return;
    }
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error('Failed to copy:', err));
  };


  return (
    <div className="flex items-start gap-3 mb-6 justify-end group">
      <div className="flex flex-col max-w-[70%]">
        {message.files && message.files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.files.map((file, index) => (
              <div key={index} className="relative">
                {file.type.startsWith('image/') && file.preview && (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="max-w-xs rounded-lg"
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div className="rounded-2xl px-4 py-3 bg-neutral-800/80 hover:bg-neutral-800 transition-colors">
          <div className="flex items-center justify-between mb-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-neutral-300 font-medium text-sm">You</span>
              {message.created_at && (
                <div className="flex items-center text-xs text-neutral-500">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>{formatMessageTime(message.created_at)}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-200 transition-all"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="text-neutral-100 leading-relaxed">
            <MessageDisplay message={message.content} />
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 mt-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AvatarItem className="h-8 w-8 rounded-full ring-2 ring-neutral-700/30" name={'User'} />
            </TooltipTrigger>
            <TooltipContent>
              <p>You</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};
