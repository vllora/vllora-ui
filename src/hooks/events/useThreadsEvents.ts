import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { CostValueData, LangDBCustomEvent, MessageCreatedEvent, ProjectEventUnion, TextMessageContentEvent, TextMessageEndEvent, TextMessageStartEvent, ThreadEventValue, ThreadModelStartEvent } from '@/contexts/project-events/dto';
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
        if(event.type === 'TextMessageStart') {
          const textMessageStartEvent = event as TextMessageStartEvent;
          textMessageStartEvent && textMessageStartEvent.thread_id && onThreadMessageHaveChanges({
            threadId: textMessageStartEvent.thread_id,
            event: textMessageStartEvent
          });
          return;
        }
        if(event.type === 'TextMessageEnd') {
          const textMessageEndEvent = event as TextMessageEndEvent;
          textMessageEndEvent && textMessageEndEvent.thread_id && onThreadMessageHaveChanges({
            threadId: textMessageEndEvent.thread_id,
            event: textMessageEndEvent
          });
          return;
        }
        if(event.type === 'TextMessageContent') {
          const textMessageContentEvent = event as TextMessageContentEvent;
          textMessageContentEvent && textMessageContentEvent.thread_id && onThreadMessageHaveChanges({
            threadId: textMessageContentEvent.thread_id,
            event: textMessageContentEvent
          });
          return;
        }
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
           if(event.value && (event as MessageCreatedEvent).value.event_type === 'created') {
            const messageCreatedEvent = event as MessageCreatedEvent;
            messageCreatedEvent && messageCreatedEvent.thread_id && onThreadMessageCreated({
              threadId: messageCreatedEvent.thread_id,
              event: messageCreatedEvent
            });
            return;
           }
           if(event.value && (event as ThreadModelStartEvent).name === 'model_start') {
            const threadModelStartEvent = event as ThreadModelStartEvent;
            threadModelStartEvent && threadModelStartEvent.thread_id && onThreadModelStartEvent({
              threadId: threadModelStartEvent.thread_id,
              event: threadModelStartEvent
            });
            return;
           }
           
           if(customEvent.name === 'cost') {
            const costEvent = customEvent.value as CostValueData;
            if (customEvent.thread_id) {
              updateThreadCost(customEvent.thread_id, costEvent);
            }
          }
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, onSelectThread, addThreadByEvent]);
}
