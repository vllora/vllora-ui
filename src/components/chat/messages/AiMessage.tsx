import {
  Copy,
  Check,
  Clock,
  Pencil,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AvatarItem } from './AvatarItem';
import { Message } from '@/types/chat';
import React, { useState } from 'react';
import { MessageDisplay } from '../MessageDisplay';
import { formatMessageTime } from '@/utils/dateUtils';
import { MessageMetrics } from './MessageMetrics';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

export const AiMessage: React.FC<{
  message?: Message;
  isTyping?: boolean;
}> = ({ message: msg, isTyping }) => {

  const [copied, setCopied] = useState(false);

  // Extract provider name from model_name (e.g., "openai/gpt-4" -> "openai")
  const getProviderName = (modelName?: string) => {
    if (!modelName) return 'default';
    const parts = modelName.split('/');
    return parts.length > 1 ? parts[0] : 'default';
  };

  const providerName = getProviderName(msg?.model_name);

  return (
    <div className={`flex gap-2 items-start`}>
      <div className="flex-shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {msg?.model_name ? (
                <ProviderIcon
                  provider_name={providerName}
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <AvatarItem
                  className="h-6 w-6 rounded-full"
                  name={'Assistant'}
                />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {msg?.model_name ? `Model: ${msg.model_name}` : 'AI Message'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="w-full rounded-md p-2.5 bg-neutral-900 border border-neutral-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-1.5 py-1 border-b border-neutral-800">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400 font-bold">Assistant</span>
            {msg?.created_at && (
              <div className="flex items-center text-xs text-neutral-500 ml-2">
                <Clock className="h-3 w-3 mr-1" />
                <span>{formatMessageTime(msg.created_at)}</span>
              </div>
            )}
          </div>
          {msg?.content && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Guard browser APIs for SSR
                if (typeof navigator === 'undefined' || !navigator.clipboard) {
                  console.warn('Clipboard API not available');
                  return;
                }
                if (msg?.content) {
                  navigator.clipboard
                    .writeText(msg.content)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                    .catch((err) => console.error('Failed to copy:', err));
                }
              }}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        <div className="whitespace-normal flex flex-col gap-[15px] text-gray-100 break-words overflow-wrap break-all">
          <MessageDisplay message={msg?.content || ''} />
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <MessageMetrics message={msg} />
          {/* <MessageFeedback
            threadId={thread_id}
            messageId={id}
            isTyping={isTyping}
          /> */}
        </div>

        {isTyping && (
          <div className="rounded-md p-2 flex items-center gap-2 animate-pulse mt-2">
            <Pencil className="h-4 w-4 text-white animate-pulse" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
};
