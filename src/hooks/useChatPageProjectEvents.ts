import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { ProjectEventUnion } from '@/contexts/project-events/dto';

export function useChatPageProjectEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-page-events',
      (event: ProjectEventUnion) => {
        
        console.log('==== Received project event from chat page:', event);
        // Handle different event types here
        // Example: update threads, refresh data, etc.
      }
    );

    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId]);
}
