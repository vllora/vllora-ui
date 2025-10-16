import { useMemo } from 'react';
import { ArrowDown, Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useDebugTimeline } from '@/hooks/events/useDebugTimeline';
import { SpanList } from '@/components/debug/SpanList';
import { SpanDetailPanel } from '@/components/debug/SpanDetailPanel';

export function DebugPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const {
    spanHierarchies,
    isPaused,
    flattenSpans,
    pausedCount,
    pause,
    resume,
    clear,
    selectedSpanId,
    setSelectedSpanId,
    selectedSpan,
  } = useDebugTimeline({
    projectId: currentProjectId || '',
  });

  

  // Get spans from the same run as the selected span
  const spansOfSelectedRun = useMemo(() => {
    if (!selectedSpan?.run_id) return [];
    return flattenSpans.filter(s => s.run_id === selectedSpan.run_id);
  }, [selectedSpan, flattenSpans]);

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
                Real-time span hierarchy with parent-child relationships
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
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
                disabled={flattenSpans.length === 0}
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
          <div className="h-full overflow-y-auto">
            <div className="relative min-h-full flex flex-col">
              <SpanList
                hierarchies={spanHierarchies}
                flattenSpans={flattenSpans}
                selectedSpanId={selectedSpanId}
                onSpanSelect={(spanId) => setSelectedSpanId(spanId)}
              />
             
            </div>
          </div>
        </div>
        {/* Detail Panel */}
        {selectedSpan && (
          <div className="w-[40vw]">
            <SpanDetailPanel
              span={selectedSpan}
              relatedSpans={spansOfSelectedRun}
              onClose={() => setSelectedSpanId(undefined)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
