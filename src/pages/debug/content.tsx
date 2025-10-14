import { useMemo } from 'react';
import { ArrowDown, Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useDebugTimeline } from '@/hooks/events/useDebugTimeline';
import { HierarchicalTimeline } from '@/components/debug/HierarchicalTimeline';
import { useAutoScrollToBottom } from '@/hooks/useAutoScrollToBottom';
import { SpanList } from '@/components/debug/SpanList';
import { RunList } from '@/components/debug/RunList';
import { TraceList } from '@/components/debug/TraceList';
import { useDebugSelection } from '@/contexts/DebugSelectionContext';
import { SpanDetailPanel } from '@/components/debug/SpanDetailPanel';

export function DebugPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const {
    threads,
    runs,
    traces,
    spanHierarchies,
    isPaused,
    spans,
    pausedCount,
    pause,
    resume,
    clear,
    groupingLevel,
    setGroupingLevel,
    selectedSpanId,
    setSelectedSpanId,
    selectedSpan,
  } = useDebugTimeline({
    projectId: currentProjectId || '',
  });
  const {
    containerRef,
    isAtBottom,
    isScrollable,
    scrollToBottom,
  } = useAutoScrollToBottom<HTMLDivElement>({
    isActive: !isPaused,
    dependencies: useMemo(() => {
      const latestThreadActivity = threads.length > 0 ? threads[threads.length - 1].lastActivity : 0;
      const latestRunActivity = runs.length > 0 ? runs[runs.length - 1].lastActivity : 0;
      const latestTraceActivity = traces.length > 0 ? traces[traces.length - 1].lastActivity : 0;
      const latestSpanActivity = spans.length > 0 ? spans[spans.length - 1].finish_time_us : 0;

      if (groupingLevel === 'threads') {
        return [groupingLevel, threads.length, latestThreadActivity];
      } else if (groupingLevel === 'runs') {
        return [groupingLevel, runs.length, latestRunActivity];
      } else if (groupingLevel === 'traces') {
        return [groupingLevel, traces.length, latestTraceActivity];
      } else {
        return [groupingLevel, spans.length, latestSpanActivity];
      }
    }, [groupingLevel, threads, runs, traces, spans]),
    threshold: 10,
  });

  // Get spans from the same run as the selected span
  const spansOfSelectedRun = useMemo(() => {
    if (!selectedSpan?.run_id) return [];
    return spans.filter(s => s.run_id === selectedSpan.run_id);
  }, [selectedSpan, spans]);

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground mb-2">
            No Project Selected
          </h2>
          <p className="text-sm text-muted-foreground/70">
            Please select a project to view debug events
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col flex-1 h-full">
      {/* Main content area */}
      <div className="flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h1 className="text-xl font-semibold">Debug Console</h1>
              <p className="text-sm text-muted-foreground">
                Real-time hierarchical timeline: Threads → Runs → Traces → Spans
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded border border-border overflow-hidden">
                <Button
                  variant={groupingLevel === 'threads' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 rounded-none"
                  onClick={() => setGroupingLevel('threads')}
                >
                  Threads
                </Button>
                <Button
                  variant={groupingLevel === 'runs' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 rounded-none"
                  onClick={() => setGroupingLevel('runs')}
                >
                  Runs
                </Button>
                <Button
                  variant={groupingLevel === 'traces' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 rounded-none"
                  onClick={() => setGroupingLevel('traces')}
                >
                  Traces
                </Button>
                <Button
                  variant={groupingLevel === 'spans' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 rounded-none"
                  onClick={() => setGroupingLevel('spans')}
                >
                  Spans
                </Button>
              </div>

              {/* Pause/Resume */}
              {isPaused ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={resume}
                  className="h-9"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                  {pausedCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-background/20 rounded text-xs">
                      +{pausedCount}
                    </span>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pause}
                  className="h-9"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              )}

              {/* Clear */}
              <Button
                variant="outline"
                size="sm"
                onClick={clear}
                disabled={threads.length === 0}
                className="h-9"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className='flex flex-1 flex-row'>
        <div className="flex-1 overflow-hidden">
          <div ref={containerRef} className="h-full overflow-y-auto">
            <div className="relative min-h-full flex flex-col">
              {groupingLevel === 'threads' && <HierarchicalTimeline threads={threads} />}
              {groupingLevel === 'runs' && <RunList runs={runs} />}
              {groupingLevel === 'traces' && <TraceList traces={traces} />}
              {groupingLevel === 'spans' && <SpanList hierarchies={spanHierarchies} spans={spans} onSpanSelect={(spanId) => setSelectedSpanId(spanId)} />}
              {!isAtBottom && isScrollable && (
                <div className="sticky bottom-4 flex justify-end pr-4">
                  <Button
                    size="sm"
                    onClick={scrollToBottom}
                    variant="secondary"
                    className="shadow-md"
                  >
                    <ArrowDown className="w-4 h-4 mr-2" />
                    Scroll to latest
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Detail Panel */}
        {selectedSpan && (
          <div className="w-[40vw]">
            <SpanDetailPanel
              span={selectedSpan}
              relatedSpans={spansOfSelectedRun}
              onClose={() => setSelectedSpanId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
