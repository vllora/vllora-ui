import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { LangDBCustomEvent, ProjectEventUnion, ThreadEventValue } from '@/contexts/project-events/dto';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';

export function useChatPageProjectEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
  onSelectThread: (threadId: string) => void;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId, onSelectThread } = props;
  const { addThreadByEvent } = ThreadsConsumer();
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-page-events',
      (event: ProjectEventUnion) => {

        console.log('==== Received project event from chat page:', event);
        if(event.type === 'Custom') {
           if(event.name === 'thread_event') {
            const threadEvent = event as LangDBCustomEvent;
            const threadId = threadEvent.thread_id;
            if (threadId) {
              let threadEventInfo = threadEvent.value as ThreadEventValue;
              // Add/update thread using the event data
              setTimeout(() => {
                addThreadByEvent(threadEventInfo, (newThreadId, isNew) => {
                  // If there's no currently selected thread and this is a new thread, select it
                  if (!currentThreadId && isNew) {
                    onSelectThread(newThreadId);
                  }
                });
              }, 0)
            }
           }
        }
        // Handle different event types here
        // Example: update threads, refresh data, etc.
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, onSelectThread, addThreadByEvent]);
}
