import React, { useState } from "react";
import {
  CogIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/solid";
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
import { MessageDisplay } from "../MessageDisplay";
import { ContentArrayDisplay } from "./ContentArrayDisplay";
import { Message } from "@/types/chat";
import { useRelativeTime } from "@/hooks/useRelativeTime";

export const SystemMessage: React.FC<{ msg: Message }> = ({ msg }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const messageRef = React.useRef<HTMLDivElement>(null);
  useRelativeTime(messageRef, msg.created_at);


  // Function to count lines in a string
  const countLines = (text: string): number => {
    return text ? text.split("\n").length : 0;
  };

  // Function to get first N lines of text
  const getFirstNLines = (text: string, n: number): string => {
    if (!text) return "";
    const lines = text.split("\n");
    return lines.slice(0, n).join("\n");
  };

  const messageContent = msg.content || "";
  const lineCount = countLines(messageContent);
  const hasMoreLines = lineCount > 5;
  const displayMessage =
    expanded || !hasMoreLines ? messageContent : getFirstNLines(messageContent, 5);

  return (
    <div
      className="flex flex-col gap-3 group"
      ref={messageRef}
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
                      .writeText(msg.content)
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
        ) : (
          <div className="px-4 py-3">
            <div className="whitespace-normal text-neutral-200 break-words overflow-wrap break-all leading-relaxed text-sm">
              <MessageDisplay message={displayMessage} />
            </div>
            {hasMoreLines && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all font-medium text-xs"
              >
                {expanded ? (
                  <>
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                    Show {lineCount - 5} more line{lineCount - 5 !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
