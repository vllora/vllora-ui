
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { useEffect } from "react";

export function TracesPageContent() {
  const { detailSpan, spansOfSelectedRun, setDetailSpanId, refreshRuns } = TracesPageConsumer();
  useEffect(() => {
    refreshRuns();
  }, []);
  return <div className="flex flex-row flex-1 h-full overflow-hidden">
    <div className={`flex flex-col transition-all duration-300 ${detailSpan ? 'flex-1/2' : 'flex-1'} h-full`}>
      <RunTable />
    </div>
    {detailSpan && (
      <div className="flex-1/2 w-full h-full animate-in slide-in-from-right duration-300 border-l border-border overflow-auto">
        <SpanDetailPanel
          span={detailSpan}
          relatedSpans={spansOfSelectedRun}
          onClose={() => {
            setDetailSpanId(null);
          }}
        />
      </div>
    )}
  </div>;
}


