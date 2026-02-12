/**
 * SingleMessageRender
 *
 * Stitch-inspired message renderer for the Record Detail sidebar.
 * Displays each conversation message in a card with role badge, content,
 * and hover-only raw view / copy actions.
 *
 * Separate from SingleMessage to avoid affecting other consumers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import { ToolCallList } from "@/components/chat/messages/ToolCallList";

interface SingleMessageRenderProps {
  role: string;
  content?: string;
  toolCalls?: unknown[];
  parts?: unknown[];
  tool_call_id?: string;
}

/** Role badge colors matching the table convention */
function getRoleConfig(role: string) {
  const normalized = role?.toLowerCase?.() || "";
  switch (normalized) {
    case "system":
      return {
        label: "System",
        badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        hoverBorder: "hover:border-amber-500/30",
      };
    case "user":
    case "human":
      return {
        label: "User",
        badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        hoverBorder: "hover:border-blue-500/30",
      };
    case "assistant":
    case "ai":
    case "model":
      return {
        label: "Assistant",
        badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        hoverBorder: "hover:border-emerald-500/30",
        ring: "ring-1 ring-emerald-500/20",
      };
    case "tool":
      return {
        label: "Tool",
        badgeClass: "bg-green-500/10 text-green-500 border-green-500/20",
        hoverBorder: "hover:border-green-500/30",
      };
    default:
      return {
        label: role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : "Message",
        badgeClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
        hoverBorder: "hover:border-zinc-500/30",
      };
  }
}

export function SingleMessageRender({
  role,
  content,
  toolCalls,
  parts,
  tool_call_id,
}: SingleMessageRenderProps) {
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const config = getRoleConfig(role);

  // Assemble display text from content + parts
  const partsArray = Array.isArray(parts) ? parts : [];
  const textSegments: string[] = [];
  const seenText = new Set<string>();

  const registerText = (segment?: string) => {
    if (!segment) return;
    const trimmed = segment.trim();
    if (!trimmed || seenText.has(trimmed)) return;
    seenText.add(trimmed);
    textSegments.push(segment);
  };

  if (typeof content === "string") registerText(content);
  partsArray
    .filter((p): p is { text: string } => typeof (p as Record<string, unknown>)?.text === "string" && ((p as Record<string, unknown>).text as string).trim().length > 0)
    .forEach((p) => registerText(p.text));

  const displayText = textSegments.join("\n\n");
  const hasText = displayText.trim().length > 0;

  // Detect content overflow for expand/collapse
  useEffect(() => {
    if (!hasText || !contentRef.current) {
      setShowExpandButton(false);
      setIsExpanded(false);
      return;
    }
    const exceedsLimit = contentRef.current.scrollHeight > 200;
    setShowExpandButton(exceedsLimit);
    if (!exceedsLimit) setIsExpanded(false);
  }, [hasText, displayText]);

  const handleCopy = useCallback(async () => {
    try {
      let text = displayText;
      if (!text && toolCalls) text = JSON.stringify(toolCalls, null, 2);
      if (text) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  }, [displayText, toolCalls]);

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border/50 bg-muted/20 p-4 transition-all",
        config.ring,
        config.hoverBorder
      )}
    >
      {/* Header: role badge + actions */}
      <div className="flex justify-between items-start mb-2">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
            config.badgeClass
          )}
        >
          {config.label}
        </span>

        {/* Hover-only actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRawMode(!rawMode);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={rawMode ? "Formatted view" : "Raw view"}
          >
            {rawMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {hasText && (
        <div
          ref={contentRef}
          className={cn(
            "text-xs text-foreground/80 leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_li]:text-xs [&_p]:text-xs",
            rawMode && "whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground",
            !isExpanded && showExpandButton && !rawMode && "max-h-[200px] overflow-hidden",
            isExpanded && "max-h-[500px] overflow-y-auto"
          )}
        >
          {rawMode ? displayText : <MarkdownViewer message={displayText} />}
        </div>
      )}

      {/* Expand/collapse */}
      {!rawMode && showExpandButton && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-[rgb(var(--theme-500))] hover:underline"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Tool call ID */}
      {tool_call_id && (
        <div className="mt-2 text-[10px] text-muted-foreground/50 font-mono truncate">
          tool_call_id: {tool_call_id}
        </div>
      )}

      {/* Tool calls */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ToolCallList toolCalls={toolCalls as any} />
        </div>
      )}
    </div>
  );
}
