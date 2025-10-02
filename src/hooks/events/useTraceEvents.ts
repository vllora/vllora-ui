import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import { LangDBCustomEvent, LangDBEventSpan, ProjectEventUnion } from '@/contexts/project-events/dto';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export function useTraceEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const { addEventSpans } = ChatWindowConsumer();
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-trace-events',
      (event: ProjectEventUnion) => {

        if(event.type === 'Custom') {
          const customEvent = event as LangDBCustomEvent;
           
           if(customEvent.name === 'span_end' && customEvent.thread_id && customEvent.thread_id === currentThreadId) {
            let eventValue = event.value as { span: LangDBEventSpan };
            if (eventValue && eventValue.span) {
              addEventSpans([eventValue.span]);
            }
           }
           
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId]);
}
