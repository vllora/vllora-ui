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
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import ReactJson from 'react-json-view';

export const AiMessage: React.FC<{
  message?: Message;
  isTyping?: boolean;
}> = ({ message: msg, isTyping }) => {

  const [copied, setCopied] = useState(false);
  const [toolCopiedStates, setToolCopiedStates] = useState<{
    [key: string]: boolean;
  }>({});

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
        {msg?.tool_calls && msg.tool_calls.length > 0 && (
          <div className="mb-3 border border-neutral-700 rounded-md overflow-hidden bg-neutral-800/50">
            <div className="px-3 py-1.5 border-b border-neutral-700 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-300">
                Tool Calls
              </span>
              <span className="text-xs text-neutral-500">
                {msg.tool_calls.length}{" "}
                {msg.tool_calls.length === 1 ? "call" : "calls"}
              </span>
            </div>
            <div className="divide-y divide-neutral-700">
              {msg.tool_calls.map((tool_call, index) => {
                if (tool_call.function) {
                  const function_display = tool_call.function;
                  // Format function name for better display
                  const functionName = tool_call.function.name;
                  const formattedName = functionName
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .trim()
                    .replace(/^./, (str) => str.toUpperCase());

                  // Handle copy function
                  const handleCopyToolCall = () => {
                    // Guard browser APIs for SSR
                    if (
                      typeof navigator === "undefined" ||
                      !navigator.clipboard
                    ) {
                      console.warn("Clipboard API not available");
                      return;
                    }
                    if (tool_call.function) {
                      navigator.clipboard
                        .writeText(JSON.stringify(tool_call.function, null, 2))
                        .then(() => {
                          setToolCopiedStates((prev) => ({
                            ...prev,
                            [tool_call.id]: true,
                          }));
                          setTimeout(() => {
                            setToolCopiedStates((prev) => ({
                              ...prev,
                              [tool_call.id]: false,
                            }));
                          }, 2000);
                        })
                        .catch((err) =>
                          console.error("Failed to copy tool call:", err),
                        );
                    }
                  };

                  const isToolCopied = toolCopiedStates[tool_call.id] || false;

                  return (
                    <div
                      key={index}
                      className="px-3 py-2.5 bg-neutral-800/30 rounded-sm mb-1 last:mb-0"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-neutral-300">
                            {formattedName}
                          </span>
                          <span className="text-xs text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
                            {tool_call.id}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyToolCall();
                          }}
                          className="text-neutral-500 hover:text-neutral-300 transition-colors"
                          title={isToolCopied ? "Copied!" : "Copy function"}
                        >
                          {isToolCopied ? (
                            <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="max-w-full overflow-x-auto">
                        <ReactJson
                          key={index}
                          name={false}
                          collapsed={2}
                          displayDataTypes={false}
                          displayObjectSize={false}
                          enableClipboard={false}
                          theme={{
                            base00: "transparent",
                            base01: "#404040",
                            base02: "#525252",
                            base03: "#737373",
                            base04: "#a3a3a3",
                            base05: "#d4d4d4",
                            base06: "#e5e5e5",
                            base07: "#f5f5f5",
                            base08: "#f87171", // red
                            base09: "#fb923c", // orange
                            base0A: "#facc15", // yellow
                            base0B: "#4ade80", // green
                            base0C: "#22d3ee", // cyan
                            base0D: "#60a5fa", // blue
                            base0E: "#a78bfa", // purple
                            base0F: "#f472b6", // pink
                          }}
                          style={{
                            wordWrap: "break-word",
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "100%",
                          }}
                          src={function_display}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
        {msg?.type === "tool" && msg?.tool_call_id && (
          <div className="mb-3 border border-neutral-700 rounded-md overflow-hidden bg-neutral-800/50">
            <div className="px-3 py-1.5 border-b border-neutral-700">
              <span className="text-xs text-neutral-500">
                ID: {msg.tool_call_id}
              </span>
            </div>
            <div className="px-3 py-2">
              <div className="whitespace-normal text-gray-100 break-words overflow-wrap break-all">
                <MessageDisplay message={msg?.content || ""} />
              </div>
            </div>
          </div>
        )}
        {msg?.type !== "tool" && (
          <div className="whitespace-normal flex flex-col gap-[15px] text-gray-100 break-words overflow-wrap break-all">
            <MessageDisplay message={msg?.content || ""} />
          </div>
        )}
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
