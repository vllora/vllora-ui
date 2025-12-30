
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";
import { GroupingSelector } from "@/components/traces/GroupingSelector";
import { useEffect } from "react";
import { ProjectsConsumer } from "@/lib";
import { useSearchParams, useNavigate, useLocation } from "react-router";
import { X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LabelFilter } from "@/components/label-filter";

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
    labelFilter,
  } = TracesPageConsumer();

  const { currentProjectId } = ProjectsConsumer();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const threadId = searchParams.get('thread_id');

  const handleRemoveThreadFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('thread_id');
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  useEffect(() => {
    refreshGroups();
  }, [groupByMode, duration, currentProjectId, threadId, labelFilter.selectedLabels]);

  const threadFilterBadge = threadId ? (
    <div className="inline-flex items-center gap-2 h-6 px-2.5 bg-[#151515] rounded-lg border border-border text-xs">
      <span className="text-muted-foreground">Thread:</span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-foreground max-w-[100px] truncate cursor-default">{threadId}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-mono text-xs">{threadId}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button
        onClick={handleRemoveThreadFilter}
        className="hover:bg-muted/50 rounded p-0.5 transition-colors text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  ) : undefined;

  return <div className="flex flex-col flex-1 h-full overflow-hidden">
    {/* Grouping Controls */}
    <div className="px-6 py-3 border-b border-border">
      <div className="flex items-center gap-4">
        <GroupingSelector
          groupByMode={groupByMode}
          onGroupByModeChange={setGroupByMode}
          duration={duration}
          onDurationChange={setDuration}
          filterBadge={threadFilterBadge}
        />
        <div className="w-64">
          <LabelFilter
            selectedLabels={labelFilter.selectedLabels}
            onLabelsChange={labelFilter.setLabels}
            availableLabels={labelFilter.availableLabels}
            isLoading={labelFilter.isLoading}
            placeholder="Filter labels..."
            size="sm"
          />
        </div>
      </div>
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


