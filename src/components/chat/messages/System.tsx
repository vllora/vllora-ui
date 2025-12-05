import React, { useState, useCallback } from "react";
import { CogIcon } from "@heroicons/react/24/solid";
import {
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Clock } from 'lucide-react';
import { formatMessageTime } from '@/utils/dateUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ContentArrayDisplay } from "./ContentArrayDisplay";
import { TextContent } from "./content-items";
import { Message } from "@/types/chat";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export const SystemMessage: React.FC<{ msg: Message }> = ({ msg }) => {
  const [copied, setCopied] = useState(false);
  const messageRef = React.useRef<HTMLDivElement>(null);
  const { setHoverSpanId } = ChatWindowConsumer();

  useRelativeTime(messageRef, msg.created_at);

  const handleMouseEnter = useCallback(() => {
    if (msg?.span_id) {
      setHoverSpanId(msg.span_id);
    }
  }, [msg?.span_id, setHoverSpanId]);

  const handleMouseLeave = useCallback(() => {
    setHoverSpanId(undefined);
  }, [setHoverSpanId]);

  return (
    <div
      className="flex flex-col gap-3 group"
      ref={messageRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header with Avatar and Metadata */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                   
                    <div className="h-6 w-6 rounded-full bg-neutral-800 flex items-center justify-center">
                      <CogIcon className="h-4 w-4 text-neutral-400" />
                    </div>
                  
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{msg?.model_name ? `System: ${msg.model_name}` : 'System Message'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-neutral-300 font-medium text-sm truncate">
            {'System'}
          </span>
          {msg?.created_at && (
            <div className="flex items-center text-xs text-neutral-500 shrink-0">
              <Clock className="h-3 w-3 mr-1" />
              <span>{formatMessageTime(msg.created_at)}</span>
            </div>
          )}
        </div>

        {/* Copy Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof navigator === 'undefined' || !navigator.clipboard) {
                    console.warn('Clipboard API not available');
                    return;
                  }
                  if (msg.content) {
                    navigator.clipboard
                      .writeText(msg.content as string)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      })
                      .catch((err) => console.error("Failed to copy:", err));
                  }
                }}
                className="transition-all text-neutral-500 hover:text-neutral-200 p-1.5 hover:bg-neutral-800/50 rounded shrink-0"
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-green-400" />
                ) : (
                  <ClipboardDocumentIcon className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{copied ? "Copied!" : "Copy message"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Content */}
      <div className="w-full rounded-lg overflow-hidden bg-neutral-900/30 border border-neutral-800/50">
        {msg?.content_array && msg.content_array.length > 0 ? (
          <div className="px-4 py-3">
            <ContentArrayDisplay contentArray={msg.content_array} />
          </div>
        ) : msg.content ? (
          <div className="px-4 py-3">
            <TextContent content={msg.content as string} />
          </div>
        ) : null}
      </div>
    </div>
  );
};
