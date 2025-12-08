import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Message } from "@/types/chat";
import { MarkdownViewer } from "../../markdown-viewer";
import { ContentArrayDisplay } from "@/components/chat/messages/ContentArrayDisplay";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { NodeType } from "../types";
import { getNodeIcon, getRoleStyle } from "../utils";

type ViewMode = "visual" | "raw";

interface MessagePanelProps {
  rawMessage: Message;
  nodeType: NodeType;
  label: string;
}

export const MessagePanel = ({ rawMessage, nodeType, label }: MessagePanelProps) => {
  const roleStyle = getRoleStyle(nodeType);
  const [viewMode, setViewMode] = useState<ViewMode>("visual");
  const [copied, setCopied] = useState(false);
  const typeOfContent = typeof rawMessage.content;
  const isStringContent = typeOfContent === 'string';
  const stringContent = isStringContent ? rawMessage.content as string : undefined;
  const arrayContent = !isStringContent && Array.isArray(rawMessage.content) ? rawMessage.content as any[] : undefined;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawMessage, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={roleStyle.textColor}>{getNodeIcon(nodeType)}</span>
          <span className="text-sm font-medium text-zinc-200">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1 bg-[#21262d] rounded-md p-0.5">
            <button
              onClick={() => setViewMode("visual")}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === "visual"
                  ? "bg-[#30363d] text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setViewMode("raw")}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === "raw"
                  ? "bg-[#30363d] text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Raw
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {viewMode === "visual" ? (
          <>
            {arrayContent && <ContentArrayDisplay contentArray={arrayContent} />}
            {!arrayContent && stringContent && (
              <div className="text-foreground leading-relaxed whitespace-normal break-words text-sm">
                <MarkdownViewer message={stringContent} />
              </div>
            )}
          </>
        ) : (
          <div className="text-xs">
            <JsonViewer data={rawMessage} collapsed={10} collapseStringsAfterLength={1000} />
          </div>
        )}
      </div>
    </div>
  );
};
