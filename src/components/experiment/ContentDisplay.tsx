import { useMemo } from "react";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import { tryParseJson } from "@/utils/modelUtils";

interface ContentDisplayProps {
  content: string;
  className?: string;
}

export function ContentDisplay({ content, className }: ContentDisplayProps) {
  const { isJson, parsedJson } = useMemo(() => {
    if (!content) return { isJson: false, parsedJson: null };
    const parsed = tryParseJson(content);
    const isValidJson = parsed !== null && typeof parsed === "object";
    return { isJson: isValidJson, parsedJson: parsed };
  }, [content]);

  if (!content) return null;

  if (isJson && parsedJson) {
    return (
      <div className={className}>
        <JsonViewer data={parsedJson} collapsed={10} collapseStringsAfterLength={100} />
      </div>
    );
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 ${className || ""}`}>
      <MarkdownViewer message={content} />
    </div>
  );
}
