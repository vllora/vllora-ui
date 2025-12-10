import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactJson from "react-json-view";
import type { Message } from "@/types/chat";
import { tryParseJson } from "@/utils/modelUtils";

type ToolCall = NonNullable<Message["tool_calls"]>[number];

const formatFunctionName = (name?: string) => {
  if (!name) return "Unknown Function";
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
};

export const ToolCallList = ({ toolCalls, hideTitle }: { toolCalls: ToolCall[], hideTitle?: boolean }) => {
  const [expandedToolCalls, setExpandedToolCalls] = useState<
    Record<string, boolean>
  >({});
  const [toolCopiedStates, setToolCopiedStates] = useState<
    Record<string, boolean>
  >({});

  const toolCallLookup = useMemo(() => {
    const initialState: Record<string, boolean> = {};
    toolCalls.forEach((call) => {
      if (call?.id) {
        initialState[call.id] = expandedToolCalls[call.id] ?? true;
      }
    });
    return initialState;
  }, [expandedToolCalls, toolCalls]);

  const handleCopyToolCall = useCallback((toolCall: ToolCall) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      console.warn("Clipboard API not available");
      return;
    }
    if (!toolCall.function) {
      return;
    }
    const toolCallId = toolCall.id;
    navigator.clipboard
      .writeText(JSON.stringify(toolCall.function, null, 2))
      .then(() => {
        if (!toolCallId) return;
        setToolCopiedStates((prev) => ({
          ...prev,
          [toolCallId]: true,
        }));
        setTimeout(() => {
          setToolCopiedStates((prev) => ({
            ...prev,
            [toolCallId]: false,
          }));
        }, 2000);
      })
      .catch((err) => console.error("Failed to copy tool call:", err));
  }, []);

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border">
      {!hideTitle && <div className="flex items-center justify-between border-b border-border  px-3 py-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-300">Tool Calls</span>
          <span className="text-xs text-neutral-500">
            {toolCalls.length} {toolCalls.length === 1 ? "call" : "calls"}
          </span>
        </div>
      </div>}
      <div className="divide-y divide-border">
        {toolCalls.map((toolCall, index) => {
          if (!toolCall?.function) {
            return null;
          }
          const functionName = formatFunctionName(toolCall.function?.name);
          const functionDisplay = toolCall.function;
          let arguments_value = functionDisplay.arguments;
          if (typeof arguments_value === 'string') {
            arguments_value = tryParseJson(arguments_value) || arguments_value;
            functionDisplay.arguments = arguments_value;
          }
          const toolId = toolCall.id ?? `tool-call-${index}`;
          const isExpanded = toolCallLookup[toolId] ?? true;
          const isToolCopied = toolCopiedStates[toolId] || false;

          return (
            <div
              key={toolId}
              className="transition-colors"
            >
              <div
                className="cursor-pointer px-3 py-2"
                onClick={() => {
                  setExpandedToolCalls((prev) => ({
                    ...prev,
                    [toolId]: !(prev[toolId] ?? true),
                  }));
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                    )}
                    <span className="truncate text-sm font-medium text-neutral-200">
                      {functionName}
                    </span>
                    {toolCall.id && (
                      <span className="truncate font-mono text-xs text-neutral-500">
                        {toolCall.id}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCopyToolCall(toolCall);
                    }}
                    className="ml-2 rounded p-0.5 text-neutral-500 transition-colors hover:bg-neutral-700/30 hover:text-neutral-300"
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
                <div className="max-w-full overflow-x-auto px-3 pb-2">
                  <div className="rounded p-2">
                    {functionDisplay && typeof functionDisplay === "object" ? (
                      <ReactJson
                        key={toolId}
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
                        src={functionDisplay}
                      />
                    ) : (
                      <pre className="text-xs text-neutral-400">
                        {JSON.stringify(functionDisplay, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

ToolCallList.displayName = "ToolCallList";
