import { startTransition, useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { CostValueData, LangDBCustomEvent, LangDBEventSpan, ProjectEventUnion, ThreadEventValue } from '@/contexts/project-events/dto';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { convertToNormalSpan, getTokensInfo, getTotalCost } from '@/contexts/project-events/util';

export function useThreadsEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
  onSelectThread: (threadId: string) => void;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId, onSelectThread } = props;
  const { addThreadByEvent, updateThreadCost } = ThreadsConsumer();
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-page-events',
      (event: ProjectEventUnion) => {

        if(event.type === 'Custom') {
          const customEvent = event as LangDBCustomEvent;
           if(event.name === 'thread_event') {
            const threadId = customEvent.thread_id;
            if (threadId) {
              let threadEventInfo = customEvent.value as ThreadEventValue;
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
            return;
           }
           
           if(customEvent.name === 'cost') {
            const costEvent = customEvent.value as CostValueData;
            updateThreadCost(currentThreadId, costEvent.cost);
          }
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, onSelectThread, addThreadByEvent]);
}
