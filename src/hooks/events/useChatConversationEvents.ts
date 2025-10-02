import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import {  ProjectEventUnion } from '@/contexts/project-events/dto';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export function useChatConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {isChatProcessing, refreshMessages} = ChatWindowConsumer()
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-conversation-events',
      (event: ProjectEventUnion) => {

        if(event.type === 'Custom') {
           if(event.thread_id === currentThreadId && event.name === 'message_event') {
            if(event.value && event.value.event_type === 'created' && !isChatProcessing) {
              refreshMessages()
            }
            
           }
           
        }
        // Handle different event types here
        // Example: update threads, refresh data, etc.
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, isChatProcessing, refreshMessages]);
}
