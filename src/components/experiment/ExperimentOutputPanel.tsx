import { useState, useMemo } from "react";
import { JsonViewer } from "@/components/chat/traces/TraceRow/span-info/JsonViewer";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";
import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";
import { tryParseJson } from "@/utils/modelUtils";
import type { Span } from "@/types/common-type";

interface ExperimentOutputPanelProps {
  result: string;
  originalOutput: string;
  running: boolean;
  isStreaming: boolean;
  traceSpans: Span[];
  loadingTraceSpans: boolean;
  projectId: string;
  onLoadTraceSpans: () => void;
  setDetailSpanId: (id: string | null) => void;
}

interface ContentDisplayProps {
  content: string;
  className?: string;
}

function ContentDisplay({ content, className }: ContentDisplayProps) {
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

export function ExperimentOutputPanel({
  result,
  originalOutput,
  running,
  isStreaming,
  traceSpans,
  loadingTraceSpans,
  projectId,
  onLoadTraceSpans,
  setDetailSpanId,
}: ExperimentOutputPanelProps) {
  const [activeTab, setActiveTab] = useState<"output" | "trace">("output");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [collapsedSpans, setCollapsedSpans] = useState<string[]>([]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs - fixed at top */}
      <div className="px-4 pt-4 flex-shrink-0">
        <div className="flex items-center gap-4 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab("output")}
            className={`text-sm font-semibold pb-2 ${
              activeTab === "output"
                ? "border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Output
          </button>
          <button
            onClick={() => {
              setActiveTab("trace");
              onLoadTraceSpans();
            }}
            className={`text-sm font-semibold pb-2 ${
              activeTab === "trace"
                ? "border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Trace
          </button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
        {activeTab === "output" ? (
          <div className="flex flex-col h-full">
            {/* New Output - takes available space */}
            <div className="flex-1 min-h-0">
              {(result || running) ? (
                <div className="rounded-lg border border-border overflow-hidden h-full flex flex-col">
                  <div className="px-3 py-2 bg-[rgb(var(--theme-500))]/10 border-b border-border flex items-center gap-2 flex-shrink-0">
                    {running ? (
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))]" />
                    )}
                    <span className="text-xs font-medium">New Output</span>
                    {running && (
                      <span className="text-xs text-muted-foreground animate-pulse">
                        {isStreaming ? "Streaming..." : "Waiting for response..."}
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 overflow-y-auto text-sm">
                    {result ? (
                      <ContentDisplay content={result} />
                    ) : running ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Waiting for response...</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : !originalOutput ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Run the experiment to see output
                </div>
              ) : null}
            </div>

            {/* Original Output - always at bottom */}
            {originalOutput && (
              <div className="rounded-lg flex-1 flex flex-col border border-dashed border-border overflow-hidden mt-4 flex-shrink-0">
                <div className="px-3 py-2 bg-muted/50 border-b border-dashed border-border">
                  <span className="text-xs font-medium text-muted-foreground">
                    Original Output
                  </span>
                </div>
                <div className="p-3 flex-1 overflow-y-scroll text-sm">
                  <ContentDisplay
                    content={originalOutput}
                    className="text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full">
            {loadingTraceSpans ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading trace...</span>
                </div>
              </div>
            ) : traceSpans.length > 0 ? (
              <TimelineContent
                spansByRunId={traceSpans}
                projectId={projectId}
                selectedSpanId={selectedSpanId}
                setSelectedSpanId={setSelectedSpanId}
                setSelectedRunId={() => {}}
                setDetailSpanId={setDetailSpanId}
                collapsedSpans={collapsedSpans}
                onToggle={(spanId) => {
                  if (collapsedSpans.includes(spanId)) {
                    setCollapsedSpans(collapsedSpans.filter(id => id !== spanId));
                  } else {
                    setCollapsedSpans([...collapsedSpans, spanId]);
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Run the experiment to see trace
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
