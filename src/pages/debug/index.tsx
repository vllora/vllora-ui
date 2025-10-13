import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ProjectEventsProvider } from '@/contexts/project-events';
import { DebugPageContent } from './content';

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