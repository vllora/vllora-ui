import { useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectEventsProvider } from '@/contexts/project-events';
import { useDebugEvents } from '@/hooks/events/useDebugEvents';
import { FilterBar } from '@/components/debug/FilterBar';
import { EventTimeline } from '@/components/debug/EventTimeline';

function DebugPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const {
    events,
    isPaused,
    pausedCount,
    pause,
    resume,
    clear,
  } = useDebugEvents({
    projectId: currentProjectId || '',
    maxEvents: 1000,
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [threadId, setThreadId] = useState('');
  const [runId, setRunId] = useState('');

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
              Real-time event stream for project debugging
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

            {/* Clear Events */}
            <Button
              variant="outline"
              size="sm"
              onClick={clear}
              disabled={events.length === 0}
              className="h-9"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedEventTypes={selectedEventTypes}
        onEventTypesChange={setSelectedEventTypes}
        threadId={threadId}
        onThreadIdChange={setThreadId}
        runId={runId}
        onRunIdChange={setRunId}
      />

      {/* Event Timeline */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <EventTimeline
            events={events}
            filters={{
              eventTypes: selectedEventTypes,
              searchQuery,
              threadId: threadId || undefined,
              runId: runId || undefined,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export const DebugPage = () => {
  const { currentProjectId } = ProjectsConsumer();

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
    <ProjectEventsProvider projectId={currentProjectId}>
      <DebugPageContent />
    </ProjectEventsProvider>
  );
};