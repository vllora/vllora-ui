import React, { useState } from "react";
import {
  CogIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/solid";
import {
  ClipboardDocumentIcon,
  CheckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { formatMessageTime } from '@/utils/dateUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { MessageDisplay } from "../MessageDisplay";
import { Message } from "@/types/chat";

const getProviderName = (modelName?: string) => {
  if (!modelName) return 'default';
  const parts = modelName.split('/');
  return parts.length > 1 ? parts[0] : 'default';
};
export const SystemMessage: React.FC<{ msg: Message }> =({ msg }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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
    <div className="flex items-start gap-2 mb-2">
      <div className="flex-shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <CogIcon className="h-6 w-6 rounded-full text-white" />
            </TooltipTrigger>
            <TooltipContent>
              <p>System Message</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex flex-col w-full">
        <div className="rounded-md p-2.5 bg-zinc-900 border border-zinc-800 text-gray-400 whitespace-pre-wrap">
          <div className="flex items-center justify-between mb-1.5 py-2 border-b border-zinc-800">
            <div className="flex items-center gap-1.5">
              {msg?.model_name ? (
                <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger>
                        <ProviderIcon provider_name={providerName} className="h-4 w-4 rounded-full" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>System Message: {msg.model_name}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <CogIcon className="h-4 w-4 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>System Message</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className="text-gray-400 font-bold">System</span>
              {msg.created_at && (
                <div className="flex items-center text-xs text-gray-500 ml-2">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  <span>{formatMessageTime(msg.created_at)}</span>
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Guard browser APIs for SSR
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
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title={copied ? "Copied!" : "Copy message"}
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="text-gray-300">
            <MessageDisplay message={displayMessage} />
            {hasMoreLines && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 mt-2 text-gray-500 hover:text-gray-300 transition-colors font-medium"
              >
                {expanded ? (
                  <>
                    <ChevronUpIcon className="h-4 w-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-4 w-4" />
                    Read more ({lineCount - 5} more lines)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
