import { useMemo, useState } from 'react';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useDebugTimeline } from '@/hooks/events/useDebugTimeline';
import { SpanList } from '@/components/debug/SpanList';
import { SpanDetailPanel } from '@/components/debug/SpanDetailPanel';
import { Span } from '@/types/common-type';

export function DebugPageContent() {
  const { currentProjectId } = ProjectsConsumer();
  const [flattenSpans, setFlattenSpans] = useState<Span[]>([]);

  const {
    spanHierarchies,
    selectedSpanId,
    setSelectedSpanId,
    selectedSpan,
  } = useDebugTimeline({
    projectId: currentProjectId || '',
    flattenSpans,
    setFlattenSpans,
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
          <div className="w-[40vw] animate-in slide-in-from-right duration-300">
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
