import { useParams } from 'react-router-dom';
import { ThreadsProvider } from '@/contexts/ThreadsContext';
import { ChatPage } from './chat';

export function ChatPageWrapper() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return null;
  }

  return (
    <ThreadsProvider projectId={projectId}>
      <ChatPage />
    </ThreadsProvider>
  );
}
