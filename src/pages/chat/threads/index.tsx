import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ThreadsProvider } from '@/contexts/ThreadsContext';
import { ThreadsPageContent } from './content';

export function ThreadPage() {
  const { currentProjectId } = ProjectsConsumer();

  if (!currentProjectId) {
    return null;
  }

  return (
    <ThreadsProvider projectId={currentProjectId}>
      <ThreadsPageContent />
    </ThreadsProvider>
  );
}