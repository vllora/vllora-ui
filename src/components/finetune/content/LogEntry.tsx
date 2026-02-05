/**
 * LogEntry
 *
 * Renders a single log entry with terminal-style coloring.
 * Parses and formats JSON content within logs.
 */

import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";

/**
 * Formats a log prefix like [log] with terminal-style coloring.
 */
function formatLogPrefix(text: string) {
  // Match [log], [error], [warn], [info], [debug] patterns
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part, i) => {
    if (part.match(/^\[log\]$/i)) {
      return <span key={i} className="text-cyan-400">{part}</span>;
    }
    if (part.match(/^\[error\]$/i)) {
      return <span key={i} className="text-red-400">{part}</span>;
    }
    if (part.match(/^\[warn\]$/i)) {
      return <span key={i} className="text-yellow-400">{part}</span>;
    }
    if (part.match(/^\[info\]$/i)) {
      return <span key={i} className="text-blue-400">{part}</span>;
    }
    if (part.match(/^\[debug\]$/i)) {
      return <span key={i} className="text-gray-400">{part}</span>;
    }
    if (part.match(/^\[[^\]]+\]$/)) {
      return <span key={i} className="text-purple-400">{part}</span>;
    }
    return <span key={i} className="text-muted-foreground">{part}</span>;
  });
}

interface LogEntryProps {
  log: string;
}

export function LogEntry({ log }: LogEntryProps) {
  // Check if log contains JSON-like content
  const jsonMatch = log.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonContent = JSON.parse(jsonMatch[0]);
      const prefix = log.slice(0, jsonMatch.index).trim();

      return (
        <div className="px-2 space-y-2">
          {prefix && (
            <div className="text-xs font-mono">{formatLogPrefix(prefix)}</div>
          )}
          <JsonViewer data={jsonContent} collapsed={1} />
        </div>
      );
    } catch {
      // Not valid JSON, fall through to plain text
    }
  }

  // Plain text log entry
  return (
    <div className="px-2">
      <div className="text-xs font-mono whitespace-pre-wrap break-words">
        {formatLogPrefix(log)}
      </div>
    </div>
  );
}
