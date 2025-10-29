
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { GroupingSelector } from "@/components/traces/GroupingSelector";
import { useEffect } from "react";

export function TracesPageContent() {
  const {
    detailSpan,
    spansOfSelectedRun,
    setDetailSpanId,
    refreshRuns,
    refreshGroups,
    groupByMode,
    setGroupByMode,
    bucketSize,
    setBucketSize,
  } = TracesPageConsumer();

  useEffect(() => {
    if (groupByMode === 'run') {
      refreshRuns();
    } else {
      refreshGroups();
    }
  }, [groupByMode, bucketSize]);

  return <div className="flex flex-col flex-1 h-full overflow-hidden">
    {/* Grouping Controls */}
    <div className="px-6 py-3 border-b border-border">
      <GroupingSelector
        groupByMode={groupByMode}
        onGroupByModeChange={setGroupByMode}
        bucketSize={bucketSize}
        onBucketSizeChange={setBucketSize}
      />
    </div>

    {/* Main Content */}
    <div className="flex flex-row flex-1 h-full overflow-hidden">
      <div className={`flex flex-col transition-all duration-300 ${detailSpan ? 'flex-1' : 'flex-1'} h-full`}>
        <RunTable />
      </div>
      {detailSpan && (
        <div className="flex-1 max-w-[35vw] h-full animate-in slide-in-from-right duration-300 border-l border-border overflow-hidden">
          <SpanDetailPanel
            span={detailSpan}
            relatedSpans={spansOfSelectedRun}
            onClose={() => {
              setDetailSpanId(null);
            }}
          />
        </div>
      )}
    </div>
  </div>;
}


