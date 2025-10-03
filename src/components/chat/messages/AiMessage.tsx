import {
  Copy,
  Check,
  Clock,
  Pencil,
  ChevronDown,
  ChevronRight,
  Wrench,
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
  const [expandedToolCalls, setExpandedToolCalls] = useState<{
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
    <div className={`flex gap-3 items-start group`}>
      <div className="flex-shrink-0 mt-1">
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
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-neutral-300 font-medium text-sm">Assistant</span>
            {msg?.created_at && (
              <div className="flex items-center text-xs text-neutral-500">
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
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 transition-all p-1 hover:bg-neutral-800/50 rounded"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        {msg?.tool_calls && msg.tool_calls.length > 0 && (
          <div className="mb-3 rounded-lg overflow-hidden bg-neutral-900/30 border border-neutral-800/50">
            <div className="px-3 py-2 flex items-center justify-between bg-neutral-800/20">
              <div className="flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs font-medium text-neutral-300">
                  Tool Calls
                </span>
                <span className="text-xs text-neutral-500">
                  {msg.tool_calls.length}{" "}
                  {msg.tool_calls.length === 1 ? "call" : "calls"}
                </span>
              </div>
            </div>
            <div className="divide-y divide-neutral-800/30">
              {msg.tool_calls.map((tool_call, index) => {
                if (tool_call.function) {
                  const function_display = tool_call.function;
                  const functionName = tool_call.function.name;
                  const formattedName = functionName
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .trim()
                    .replace(/^./, (str) => str.toUpperCase());

                  const handleCopyToolCall = () => {
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
                  const isExpanded = expandedToolCalls[tool_call.id] ?? true;

                  return (
                    <div
                      key={index}
                      className="hover:bg-neutral-800/20 transition-colors"
                    >
                      <div
                        className="px-3 py-2 cursor-pointer"
                        onClick={() => {
                          setExpandedToolCalls((prev) => ({
                            ...prev,
                            [tool_call.id]: !isExpanded,
                          }));
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium text-neutral-200 truncate">
                              {formattedName}
                            </span>
                            <span className="text-xs text-neutral-500 font-mono truncate">
                              {tool_call.id}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyToolCall();
                            }}
                            className="ml-2 text-neutral-500 hover:text-neutral-300 transition-colors p-0.5 hover:bg-neutral-700/30 rounded"
                            title={isToolCopied ? "Copied!" : "Copy function"}
                          >
                            {isToolCopied ? (
                              <CheckIcon className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-2 max-w-full overflow-x-auto">
                          <div className="bg-neutral-900/40 rounded p-2">
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
                                base08: "#f87171",
                                base09: "#fb923c",
                                base0A: "#facc15",
                                base0B: "#4ade80",
                                base0C: "#22d3ee",
                                base0D: "#60a5fa",
                                base0E: "#a78bfa",
                                base0F: "#f472b6",
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
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
        {msg?.type === "tool" && msg?.tool_call_id && (
          <div className="mb-3 rounded-md overflow-hidden bg-neutral-900/20 border border-neutral-800/40">
            <div className="px-2 py-1 bg-neutral-800/20">
              <span className="text-xs text-neutral-500">
                ID: {msg.tool_call_id}
              </span>
            </div>
            <div className="px-2 py-2">
              <div className="whitespace-normal text-neutral-100 break-words overflow-wrap break-all text-sm">
                <MessageDisplay message={msg?.content || ""} />
              </div>
            </div>
          </div>
        )}
        {msg?.type !== "tool" && (
          <div className="whitespace-normal text-neutral-100 break-words overflow-wrap break-all leading-relaxed text-sm">
            <MessageDisplay message={msg?.content || ""} />
          </div>
        )}
        {msg && (
          <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-neutral-800/30 flex-wrap">
            <MessageMetrics message={msg} />
            {/* <MessageFeedback
              threadId={thread_id}
              messageId={id}
              isTyping={isTyping}
            /> */}
          </div>
        )}

        {isTyping && (
          <div className="rounded bg-neutral-800/20 px-2 py-1.5 flex items-center gap-2 mt-2 border border-neutral-800/30">
            <Pencil className="h-3.5 w-3.5 text-neutral-400 animate-pulse" />
            <span className="text-xs text-neutral-400">Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
};
