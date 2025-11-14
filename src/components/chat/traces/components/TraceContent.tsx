import React, { useMemo } from "react";
import { TraceLoadingState } from "./TraceLoadingState";
import { TraceEmptyState } from "./TraceEmptyState";
import { TraceList } from "./TraceList";
import { cn } from "@/lib/utils";
import { RunDTO } from "@/services/runs-api";
import { TraceCodeView } from "./TraceCodeView";
import { AvailableApiKey } from "@/lib";

interface TraceContentProps {
  loadingSpans: boolean;
  runs: RunDTO[];
  hasMore: boolean;
  loadMoreRuns: () => Promise<void>;
  loadingMore: boolean;
  threadId: string;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  openTraces:  {
    run_id: string;
    tab: "trace" | "code";
}[];
app_mode: 'langdb' | 'vllora';
available_api_keys: AvailableApiKey[];
}

const TraceContentImpl: React.FC<TraceContentProps> = ({
  loadingSpans,
  runs,
  hasMore,
  loadMoreRuns,
  loadingMore,
  observerTarget,
  openTraces,
  app_mode,
  available_api_keys
}) => {   

  console.log('=== TraceContentImpl available_api_keys', available_api_keys);
   const currentRunId: string = useMemo(()=> {
      return openTraces && openTraces.length && openTraces[0] ? openTraces[0].run_id : ''
    }, [openTraces])
  
    const currentTab: 'trace' | 'code' = useMemo(()=> {
      return openTraces && openTraces.length && openTraces[0] ? openTraces[0].tab : 'trace'
    }, [openTraces])
  if (loadingSpans && (!runs || runs.length === 0)) {
    return <TraceLoadingState />;
  }

  if (!loadingSpans && (!runs || runs.length === 0)) {
    return <TraceEmptyState apiKeys={available_api_keys} haveIncludeApiKey={app_mode === 'langdb'} />;
  }

  return (
    <div className={cn("h-full flex flex-col relative")}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        {(currentTab === 'trace' || !currentRunId) ? (
          <TraceList
            runs={runs}
            hasMore={hasMore}
            loadMoreRuns={loadMoreRuns}
            loadingMore={loadingMore}
            observerTarget={observerTarget}
          />
        ) : (
          <TraceCodeView runId={currentRunId} />
        )}
      </div>
    </div>
  );
};

export const TraceContent = TraceContentImpl;
