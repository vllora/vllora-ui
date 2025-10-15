import { useCallback, useEffect } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  LangDBEventSpan,
  MessageCreatedEvent,
  ProjectEventUnion,
  TextMessageBaseEvent,
} from "@/contexts/project-events/dto";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

export function useConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {
    isChatProcessing,
    setTyping,
  } = ChatWindowConsumer();

  // Note: Message-based events are deprecated. We now use span-based architecture.
  // These handlers are kept for backward compatibility but no longer update messages directly.

  const handleMetricsFromSpan = useCallback(
    (input: {
      span: LangDBEventSpan;
      threadId: string;
      runId: string;
      messageId: string;
    }) => {
      // Deprecated: Metrics are now derived from spans in the ChatWindowContext
      console.log('Deprecated: handleMetricsFromSpan', input);
    },
    []
  );

  const handleMessagedCreatedEvent = useCallback(
    (input: {
      message_id: string;
      message_type: string;
      thread_id: string;
      run_id: string;
      timestamp: number;
    }) => {
      // Deprecated: Message creation is now handled through spans
      console.log('Deprecated: handleMessagedCreatedEvent', input);
    },
    []
  );

  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-conversation-events",
      (event: ProjectEventUnion) => {
        if (event.thread_id !== currentThreadId) return;
        if (
          event.type === "Custom" &&
          event.name === "message_event" &&
          event.value.event_type === "created"
        ) {
          let messageCreatedEvent = event as MessageCreatedEvent;
          if (messageCreatedEvent) {
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
            }, 0);
          }
          return;
        }

        if (
          event.thread_id &&
          event.thread_id === currentThreadId &&
          event.run_id &&
          ["TextMessageStart", "TextMessageContent", "TextMessageEnd"].includes(
            event.type
          )
        ) {
          let eventMessage = event as TextMessageBaseEvent;
          let message_id = eventMessage.message_id;
          let thread_id = eventMessage.thread_id;
          let run_id = eventMessage.run_id;
          let delta = (eventMessage as any).delta || "";

          setTimeout(() => {
            setTyping(
              ["TextMessageStart", "TextMessageContent"].includes(event.type)
            );
            // Deprecated: Message upsert is now handled through spans
            console.log('Text message event:', { message_id, thread_id, delta, run_id });
          }, 0);
          return;
        }

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
    setTyping,
    handleMetricsFromSpan,
    handleMessagedCreatedEvent,
  ]);
}
