import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { ProjectEventUnion } from '@/contexts/project-events/dto';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';

export function useThreadsEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
  onSelectThread: (threadId: string) => void;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId, onSelectThread } = props;
  const { addThreadByEvent, updateThreadCost, onThreadMessageHaveChanges, onThreadMessageCreated, onThreadModelStartEvent } = ThreadsConsumer();
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-page-events',
      (event: ProjectEventUnion) => {
        
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, onSelectThread, addThreadByEvent]);
}
