/**
 * MessageBubble
 *
 * A shared component for displaying chat messages with role-based styling.
 * Can be used in both dataset record views and chat interfaces.
 */

import { cn } from "@/lib/utils";

export interface MessageBubbleProps {
  /** The role of the message sender */
  role: string;
  /** The message content */
  content: string;
  /** Optional className for additional styling */
  className?: string;
  /** Compact mode for inline displays */
  compact?: boolean;
}

/**
 * Normalize role string to a standard format
 */
function normalizeRole(role: string): {
  normalized: "system" | "user" | "assistant" | "tool" | "other";
  label: string;
} {
  const lower = role.toLowerCase();

  if (lower === "system") {
    return { normalized: "system", label: "SYSTEM" };
  }
  if (lower === "user" || lower === "human") {
    return { normalized: "user", label: "USER" };
  }
  if (lower === "assistant" || lower === "ai" || lower === "model") {
    return { normalized: "assistant", label: "ASSISTANT" };
  }
  if (lower === "tool" || lower === "function") {
    return { normalized: "tool", label: "TOOL" };
  }

  return { normalized: "other", label: role.toUpperCase() };
}

/**
 * Get styling based on normalized role
 */
function getRoleStyles(normalized: string) {
  switch (normalized) {
    case "system":
      return {
        indicator: "bg-zinc-500",
        bubble: "bg-zinc-800/50",
        text: "text-zinc-400 italic",
      };
    case "user":
      return {
        indicator: "bg-green-500",
        bubble: "bg-zinc-800/80",
        text: "text-zinc-200",
      };
    case "assistant":
      return {
        indicator: null, // No indicator for assistant
        bubble: "bg-transparent",
        text: "text-zinc-200",
      };
    case "tool":
      return {
        indicator: "bg-blue-500",
        bubble: "bg-blue-900/20",
        text: "text-zinc-300",
      };
    default:
      return {
        indicator: "bg-zinc-600",
        bubble: "bg-zinc-800/30",
        text: "text-zinc-300",
      };
  }
}

export function MessageBubble({
  role,
  content,
  className,
  compact = false,
}: MessageBubbleProps) {
  const { normalized, label } = normalizeRole(role);
  const styles = getRoleStyles(normalized);

  if (compact) {
    return (
      <div className={cn("flex items-start gap-2", className)}>
        {styles.indicator && (
          <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", styles.indicator)} />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mr-2">
            {label}
          </span>
          <span className={cn("text-sm", styles.text)}>{content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Role label with indicator */}
      <div className="flex items-center gap-2">
        {styles.indicator && (
          <div className={cn("w-2 h-2 rounded-full", styles.indicator)} />
        )}
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      {/* Message content */}
      <div className={cn("rounded-lg px-4 py-3 text-sm", styles.bubble)}>
        <p className={cn("whitespace-pre-wrap leading-relaxed", styles.text)}>
          {content}
        </p>
      </div>
    </div>
  );
}
