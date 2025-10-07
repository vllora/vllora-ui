import { useCallback, useEffect, useRef } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  LangDBEventSpan,
  MessageCreatedEvent,
  ProjectEventUnion,
  TextMessageBaseEvent,
} from "@/contexts/project-events/dto";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Message, MessageMetrics } from "@/types/chat";
import { tryParseFloat, tryParseInt, tryParseJson } from "@/utils/modelUtils";

export function useConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {
    isChatProcessing,
    refreshMessages,
    serverMessages,
    setTyping,
    refreshMessageById,
    upsertMessage,
    updateMessageMetrics
  } = ChatWindowConsumer();

  

  const handleMetricsFromSpan = useCallback(
    (input: {
      span: LangDBEventSpan;
      threadId: string;
      runId: string;
      messageId: string;
    }) => {
      const { span, threadId, runId, messageId } = input;

      const attributes = span.attribute as {
        [key: string]: any;
      };
      const ttffStr = attributes.ttff;
      const ttft = ttffStr ? tryParseInt(ttffStr) : 0;
      let duration = 0;
      if (span.end_time_unix_nano && span.start_time_unix_nano) {
        const msSeconds = span.end_time_unix_nano - span.start_time_unix_nano;
        duration = msSeconds / 1000;
      }
      let usage = tryParseJson(attributes.usage);
      let costStr = attributes.cost;
      const cost = costStr ? tryParseFloat(costStr) : 0;
      const start_time_us = span.start_time_unix_nano;
      const metrics: MessageMetrics = {
        ttft,
        duration,
        usage,
        cost,
        run_id: runId,
        trace_id: span.trace_id,
        start_time_us,
      };
      console.log('===== metrics', metrics)
      setTimeout(() => {
        updateMessageMetrics({
          message_id: messageId,
          thread_id: threadId,
          run_id: runId,
          metrics: metrics,
        });
      }, 0);
    },
    []
  );




  const handleMessagedCreatedEvent = useCallback((input: {
    message_id: string;
    message_type: string;
    thread_id: string;
    run_id: string;
    timestamp: number;
  }) => {
    setTimeout(() => {
      upsertMessage({
        message_id: input.message_id,
        thread_id: input.thread_id,
        run_id: input.run_id,
        message_type: input.message_type,
        timestamp: input.timestamp,
        is_loading: true,
      });
      refreshMessageById({
        messageId: input.message_id,
        threadId: input.thread_id,
        projectId: currentProjectId,
      });
    }, 0);

    
  }, [currentProjectId]);
  
  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-conversation-events",
      (event: ProjectEventUnion) => {

        if (event.thread_id !== currentThreadId) return;
        if(event.type === 'Custom' && event.name === 'message_event' && event.value.event_type === 'created') {
           let messageCreatedEvent = event as MessageCreatedEvent;
           if(messageCreatedEvent) {
            let message_id = messageCreatedEvent.value.message_id;
            let messageType = messageCreatedEvent.value.message_type;
            let timeStamp = messageCreatedEvent.timestamp;
            setTimeout(() => {
              handleMessagedCreatedEvent({
                message_id: message_id,
                message_type: messageType,
                thread_id: currentThreadId,
                run_id: messageCreatedEvent.value.run_id,
                timestamp: timeStamp,
              });
            }, 0)
           }
          return;
          
        }

        if (
          event.thread_id &&
          event.thread_id === currentThreadId &&
          event.run_id &&
          ["TextMessageStart", "TextMessageContent", "TextMessageEnd"].includes(event.type)
        ) {
          let eventMessage = event as TextMessageBaseEvent;
          let message_id = eventMessage.message_id;
          let thread_id = eventMessage.thread_id;
          let run_id = eventMessage.run_id;
          let delta = (eventMessage as any).delta || "";
          setTimeout(() => {
            setTyping(["TextMessageStart", "TextMessageContent"].includes(event.type));
            upsertMessage({
              message_id: message_id,
              thread_id: thread_id,
              run_id: run_id || "",
              delta: delta,
              timestamp: eventMessage.timestamp,
              message_type: 'ai',
            });
          }, 0);
          return;
        }
        console.log('===== event', event)

        if (
          event.type === "Custom" &&
          event.name === "span_end" &&
          event.value?.span?.attribute?.message_id &&
          event.run_id
        ) {
          const messageId = event.value.span.attribute.message_id;
          const eventThreadId = event.value.span.thread_id;
          const runId = event.run_id;
          let eventValue = event.value as { span: LangDBEventSpan };
          if (eventValue && eventValue.span) {
          
            runId &&
              setTimeout(() => {
                handleMetricsFromSpan({
                  span: eventValue.span,
                  threadId: eventThreadId,
                  runId: runId,
                  messageId: messageId,
                });
              }, 0);
          }
        }
      }
    );
    return unsubscribe;
  }, [
    subscribe,
    currentProjectId,
    currentThreadId,
    isChatProcessing,
    refreshMessages,
    serverMessages,
  ]);
}
