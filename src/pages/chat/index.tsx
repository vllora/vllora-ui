import { ThreadsProvider } from '@/contexts/ThreadsContext';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { ChatPage } from './content';

export function ChatPageWrapper() {
  const { currentProjectId } = ProjectsConsumer();

  if (!currentProjectId) {
    return null;
  }

  return (
    <ThreadsProvider projectId={currentProjectId}>
      <ChatPage />
    </ThreadsProvider>
  );
}
