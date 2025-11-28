import { TimelineContent } from "@/components/chat/traces/components/TimelineContent";
import { NewOutputSection } from "./NewOutputSection";
import { OriginalOutputSection } from "./OriginalOutputSection";
import { ExperimentConsumer } from "@/contexts/ExperimentContext";

export function ExperimentOutputPanel() {
  const {
    result,
    originalInfo,
    resultInfo,
    
    running,
    experimentData,
    traceSpans,
    loadingTraceSpans,
    projectId,
    loadTraceSpans,
    outputPanelTab,
    setOutputPanelTab,
    selectedSpanId,
    setSelectedSpanId,
    collapsedSpans,
    setCollapsedSpans,
    setDetailSpanId,
  } = ExperimentConsumer();

  const isStreaming = experimentData.stream ?? true;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs - fixed at top */}
      <div className="px-4 pt-4 flex-shrink-0">
        <div className="flex items-center gap-4 border-b border-border pb-2">
          <button
            onClick={() => setOutputPanelTab("output")}
            className={`text-sm font-semibold pb-2 ${
              outputPanelTab === "output"
                ? "border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Output
          </button>
          <button
            onClick={() => {
              setOutputPanelTab("trace");
              loadTraceSpans();
            }}
            className={`text-sm font-semibold pb-2 ${
              outputPanelTab === "trace"
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
        {outputPanelTab === "output" ? (
          <div className="flex flex-col h-full">
            {/* New Output - takes available space */}
            <div className="flex-1 min-h-0">
              <NewOutputSection
                result={result}
                info={resultInfo}
                running={running}
                isStreaming={isStreaming}
              />
            </div>

            {/* Original Output - always at bottom */}
            {originalInfo && <OriginalOutputSection info={originalInfo} />}
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
