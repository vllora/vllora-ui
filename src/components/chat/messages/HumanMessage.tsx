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
    <div className="flex items-start gap-2 mb-2">
      <div className="flex flex-col w-full">
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
        <div className="rounded-md p-2.5 bg-zinc-800 border border-zinc-700 whitespace-pre-wrap min-w-[100px]">
          <div className="flex items-center justify-between mb-1.5 py-1 border-b border-zinc-700">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold">You</span>
              {message.created_at && (
                <div className="flex items-center text-xs text-zinc-400 ml-2">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>{formatMessageTime(message.created_at)}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleCopy}
              className="text-zinc-500 hover:text-zinc-300 transition-colors ml-1.5"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="text-gray-100">
            <MessageDisplay message={message.content} />
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <AvatarItem className="h-6 w-6 rounded-full" name={'User'} />
            </TooltipTrigger>
            <TooltipContent>
              <p>Human Message</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};
