import { Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useDebugTimeline } from '@/hooks/events/useDebugTimeline';
import { HierarchicalTimeline } from '@/components/debug/HierarchicalTimeline';

export function DebugPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const {
    threads,
    isPaused,
    pausedCount,
    pause,
    resume,
    clear,
  } = useDebugTimeline({
    projectId: currentProjectId || '',
  });

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
    <div className="flex flex-col w-full h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold">Debug Console</h1>
            <p className="text-sm text-muted-foreground">
              Real-time hierarchical timeline: Threads → Runs → Traces → Spans
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
              disabled={threads.length === 0}
              className="h-9"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Hierarchical Timeline */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <HierarchicalTimeline threads={threads} />
        </div>
      </div>
    </div>
  );
}
