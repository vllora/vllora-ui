import { useEffect, useRef } from 'react';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import {  ProjectEventUnion } from '@/contexts/project-events/dto';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export function useConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {isChatProcessing, refreshMessages, serverMessages, setServerMessages} = ChatWindowConsumer()
  
  // Buffer events by threadId
  const eventBufferRef = useRef<Map<string, ProjectEventUnion[]>>(new Map());
  
  // Function to apply buffered events for a specific message
  const applyBufferedEvents = (messageId: string, threadId: string) => {
    const bufferKey = threadId;
    const bufferedEvents = eventBufferRef.current.get(bufferKey) || [];
    
    // Filter events for this specific message
    const messageEvents = bufferedEvents.filter(event => 
      event.type === 'Custom' && 
      event.name === 'span_end' && 
      event.value?.span?.attribute?.message_id === messageId
    );
    
    if (messageEvents.length > 0) {
      console.log(`Applying ${messageEvents.length} buffered events for message ${messageId}`);
      
      // Apply all buffered events for this message
      messageEvents.forEach(event => {
        if (event.type === 'Custom' && event.value?.span?.attribute?.message_id) {
          setServerMessages((prev) => {
            return prev.map((message) => 
              message.id === event.value.span.attribute.message_id ? {
                ...message,
                metrics: [
                  {
                    ttft: event.value.span.attribute.ttft,
                    duration: event.value.span.attribute.duration,
                    start_time_us: event.value.span.attribute.start_time_us,
                    usage: event.value.span.attribute.usage,
                    cost: event.value.span.attribute.cost,
                  },
                  ...(message.metrics || []),
                ],
              } : message
            );
          });
        }
      });
      
      // Remove applied events from buffer
      const remainingEvents = bufferedEvents.filter(event => 
        !(event.type === 'Custom' && 
          event.name === 'span_end' && 
          event.value?.span?.attribute?.message_id === messageId)
      );
      
      if (remainingEvents.length === 0) {
        eventBufferRef.current.delete(bufferKey);
      } else {
        eventBufferRef.current.set(bufferKey, remainingEvents);
      }
    }
  };
  
  // Check for new messages and apply buffered events
  useEffect(() => {
    serverMessages.forEach(message => {
      if (message.thread_id === currentThreadId) {
        applyBufferedEvents(message.id, currentThreadId);
      }
    });
  }, [serverMessages, currentThreadId]);

  // Clear buffered events when threadId changes
  useEffect(() => {
    eventBufferRef.current.clear();
  }, [currentThreadId]);
  

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

           if (event.name === 'span_end') {
            if (event.value?.span?.attribute?.message_id) {
              const messageId = event.value.span.attribute.message_id;
              const eventThreadId = event.value.span.thread_id;
              
              // Check if message exists in serverMessages
              const messageExists = serverMessages.some(msg => 
                msg.id === messageId && msg.thread_id === eventThreadId
              );
              
              if (messageExists) {
                // Message exists, apply event immediately
                setServerMessages((prev) => {
                  return prev.map((message) => 
                    message.id === messageId ? {
                      ...message,
                      metrics: [
                        {
                          ttft: parseInt(event.value.span.attribute.ttft),
                          duration: event.value.span.end_time_unix_nano - event.value.span.start_time_unix_nano,
                          start_time_us: event.value.span.start_time_unix_nano,
                          usage: JSON.parse(event.value.span.attribute.usage),
                          cost: parseFloat(event.value.span.attribute.cost),
                          run_id: event.value.span.run_id,
                        },
                        ...(message.metrics || []),
                      ],
                    } : message
                  );
                });
              } else {
                const bufferKey = eventThreadId;
                const currentBuffer = eventBufferRef.current.get(bufferKey) || [];
                eventBufferRef.current.set(bufferKey, [...currentBuffer, event]);
              }
            }
          }
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId, isChatProcessing, refreshMessages, serverMessages]);
}
