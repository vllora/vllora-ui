
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { GroupingSelector } from "@/components/traces/GroupingSelector";
import { useEffect } from "react";
import { ProjectsConsumer } from "@/lib";

export function TracesPageContent() {
  const {
    detailSpan,
    spansOfSelectedRun,
    setDetailSpanId,
    refreshGroups,
    groupByMode,
    setGroupByMode,
    duration,
    setDuration,
  } = TracesPageConsumer();

  const {currentProjectId} = ProjectsConsumer();

  useEffect(() => {
    refreshGroups();
  }, [groupByMode, duration, currentProjectId]);

  return <div className="flex flex-col flex-1 h-full overflow-hidden">
    {/* Grouping Controls */}
    <div className="px-6 py-3 border-b border-border">
      <GroupingSelector
        groupByMode={groupByMode}
        onGroupByModeChange={setGroupByMode}
        duration={duration}
        onDurationChange={setDuration}
      />
    </div>

    {/* Main Content */}
    <div className="flex flex-row flex-1 h-full overflow-hidden">
      <div className={`flex flex-col transition-all duration-300 ${detailSpan ? 'flex-1' : 'flex-1'} h-full`}>
        <RunTable />
      </div>
      {detailSpan && (
        <div className="flex-1 max-w-[35vw] h-full animate-in slide-in-from-right duration-300 overflow-hidden">
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


