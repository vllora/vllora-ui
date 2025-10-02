import { useEffect } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import {  ProjectEventUnion } from '@/contexts/project-events/dto';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export function useConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {isChatProcessing, refreshMessages, serverMessages} = ChatWindowConsumer()
  useEffect(() => {
    const unsubscribe = subscribe(
      'chat-conversation-events',
      (event: ProjectEventUnion) => {

        if(event.type === 'Custom') {
           if(event.thread_id === currentThreadId && event.name === 'message_event') {
            if(event.value && event.value.event_type === 'created' && !isChatProcessing) {
               //check if the message is in serverMessages
               const message = serverMessages.find((message) => message.id === event.value.message_id);
               if(!message) {
                 refreshMessages()
               }
            }
            
           }
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, isChatProcessing, refreshMessages, serverMessages]);
}
