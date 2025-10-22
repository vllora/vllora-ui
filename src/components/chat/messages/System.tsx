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
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { MessageDisplay } from "../MessageDisplay";
import { ContentArrayDisplay } from "./ContentArrayDisplay";
import { Message } from "@/types/chat";
import { useRelativeTime } from "@/hooks/useRelativeTime";

const getProviderName = (modelName?: string) => {
  if (!modelName) return 'default';
  const parts = modelName.split('/');
  return parts.length > 1 ? parts[0] : 'default';
};
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
  const providerName = getProviderName(msg?.model_name);

  return (
    <div
      className="flex flex-col gap-2 group hover:bg-neutral-800/30 rounded-lg p-2 -m-2 transition-colors"
      ref={messageRef}
    >
      {/* Header with Avatar and Metadata */}
      <div className="flex items-center gap-3">
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
                  <CogIcon className="h-6 w-6 rounded-full text-primary/70" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{msg?.model_name ? `System: ${msg.model_name}` : 'System Message'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-neutral-300 font-medium text-sm">
            {msg?.model_name ? msg.model_name : 'System'}
          </span>
          {msg?.created_at && (
            <div className="flex items-center text-xs text-neutral-500">
              <Clock className="h-3 w-3 mr-1" />
              <span>{formatMessageTime(msg.created_at)}</span>
            </div>
          )}
        </div>

        {/* Copy Button */}
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
          className="opacity-0 group-hover:opacity-100 transition-all text-neutral-500 hover:text-neutral-300 p-1.5 hover:bg-neutral-700/40 rounded"
          title={copied ? "Copied!" : "Copy message"}
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="w-full rounded-md overflow-hidden bg-neutral-900/20 border border-neutral-800/40">
        {msg?.content_array && msg.content_array.length > 0 ? (
          <div className="px-3 py-2.5">
            <ContentArrayDisplay contentArray={msg.content_array} />
          </div>
        ) : (
          <div className="px-3 py-2.5">
            <div className="whitespace-normal text-neutral-100 break-words overflow-wrap break-all leading-relaxed text-sm">
              <MessageDisplay message={displayMessage} />
            </div>
            {hasMoreLines && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all font-medium text-xs border border-neutral-800/40 hover:border-neutral-700/60"
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
