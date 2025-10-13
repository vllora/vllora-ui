import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Pause, Play, Trash2 } from 'lucide-react';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    // Defer to next frame so newly rendered content is measurable
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      setIsAtBottom(true);
    });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const threshold = 24;
    const handleScroll = () => {
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
      setIsAtBottom((prev) => (prev !== atBottom ? atBottom : prev));
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (isPaused || !isAtBottom) {
      return;
    }
    scrollToBottom();
  }, [threads, isPaused, isAtBottom, scrollToBottom]);

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
        <div ref={scrollContainerRef} className="h-full overflow-y-auto">
          <div className="relative min-h-full flex flex-col">
            <HierarchicalTimeline threads={threads} />
            {!isAtBottom && (
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
    </div>
  );
}
