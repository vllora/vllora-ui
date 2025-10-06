import { useCallback, useEffect } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import { LangDBEventSpan, ProjectEventUnion } from "@/contexts/project-events/dto";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Message, MessageMetrics } from "@/types/chat";
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
    setServerMessages,
    setTyping,
  } = ChatWindowConsumer();

  const upsertMessage = useCallback(
    (input: {
      message_id: string;
      thread_id: string;
      run_id: string;
      trace_id?: string;
      delta?: string;
      metrics?: MessageMetrics[];
      timestamp: number;
    }) => {
      setServerMessages((prev) => {
        const messageIndex = prev.findIndex(
          (msg) =>
            msg.id === input.message_id && msg.thread_id === input.thread_id
        );
        if (messageIndex === -1) {
          let newMsg: Message = {
            id: input.message_id,
            type: "ai",
            thread_id: input.thread_id,
            content_type: "Text",
            content: input.delta || "",
            timestamp: input.timestamp,
            run_id: input.run_id,
            trace_id: input.trace_id,
            metrics: input.metrics || [{
              run_id: input.run_id
            }],
          };
          return [...prev, newMsg];
        } else {
          const newMessages = [...prev];
          let prevMsg = newMessages[messageIndex];
          let newMetrics = prevMsg.metrics || [];
          if(newMetrics.length > 0 && input.metrics && input.metrics.length > 0){
            let firstPrevMetric = newMetrics[0];
            let firstInputMetric = input.metrics[0];
            firstPrevMetric = {
              ...firstPrevMetric,
              ...firstInputMetric
            }
            newMetrics = [firstPrevMetric];
          }else{
            newMetrics = input.metrics || [{
              run_id: input.run_id
            }];
          }
          prevMsg.content += input.delta || "";
          prevMsg.timestamp = input.timestamp;
          prevMsg.run_id = input.run_id;
          prevMsg.trace_id = input.trace_id;
          prevMsg.metrics = newMetrics;
          newMessages[messageIndex] = prevMsg;
          return newMessages;
        }
      });
    },
    []
  );

  const handleSpanEndForMessageMetric = useCallback((input: {
    messageId: string;
    threadId: string;
    runId: string;
    timestamp: number;
    eventSpan: LangDBEventSpan;
  }) => {
    const { messageId, threadId, runId, eventSpan } = input;
    let eventSpanValueAttribute = eventSpan?.attribute as {
      [key: string]: any;
     };
     console.log('==== handleSpanEndForMessageMetric ', eventSpanValueAttribute)
     let cost = eventSpanValueAttribute.cost;
     let usageStr = eventSpanValueAttribute.usage;
     let usage = usageStr ?tryParseJSON(usageStr) : {};
     let ttftStr = eventSpanValueAttribute.ttft;
     let requestStr = eventSpanValueAttribute.request;
     let request = requestStr ?tryParseJSON(requestStr) : {};
     let updatedMetric = {};
     if(cost){
      updatedMetric.cost = cost;
     }
     if(usage){
      updatedMetric.usage = usage;
     }
     if(ttftStr){
      updatedMetric.ttft = ttftStr;
     }
     if(request){
      updatedMetric.request = request;
     }
     
    //  let metrics = [
    //   {
    //     ttft: eventSpanValueAttribute.ttft,
    //     duration: eventSpanValueAttribute.duration,
    //     start_time_us: eventSpanValueAttribute.start_time_us,
    //     usage: eventSpanValueAttribute.usage,
    //     cost: eventSpanValueAttribute.cost,
    //   },
    // ];
    //  upsertMessage({
    //   message_id: messageId,
    //   thread_id: threadId,
    //   run_id: runId,
    //   timestamp: eventSpanValueAttribute.timestamp,
    //   metrics: metrics,
    //   })
  },[])

  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-conversation-events",
      (event: ProjectEventUnion) => {
        if(event.thread_id !== currentThreadId){
          // ignore event that is not related to current thread
          return;
        }
        if (
          event.thread_id === currentThreadId &&
          event.run_id &&
          event.type === "TextMessageStart"
        ) {
          setTyping(true);
          return;
        }
        if (
          event.thread_id === currentThreadId &&
          event.run_id &&
          event.type === "TextMessageContent"
        ) {
          setTyping(true);
          upsertMessage({
            message_id: event.message_id,
            thread_id: event.thread_id,
            run_id: event.run_id,
            delta: event.delta,
            timestamp: event.timestamp,
          });
          return;
        }
        if (
          event.thread_id === currentThreadId &&
          event.run_id &&
          event.type === "TextMessageEnd"
        ) {
          setTyping(false);
          return;
        }

        if (event.type === "Custom") {
          if (
            event.thread_id === currentThreadId &&
            event.name === "message_event"
          ) {
            if (
              event.value &&
              event.value.event_type === "created" &&
              !isChatProcessing
            ) {
              //check if the message is in serverMessages
              const message = serverMessages.find(
                (message) => message.id === event.value.message_id
              );
              if (!message) {
                //refreshMessages()
              }
            }
            return;
          }

          if (
            event.name === "span_end" && event.thread_id === currentThreadId && event.run_id &&
            event.value?.span?.attribute?.message_id
          ) {

            handleSpanEndForMessageMetric({
              messageId: event.value.span.attribute.message_id,
              threadId: event.thread_id,
              runId: event.run_id,
              timestamp: event.timestamp,
              eventSpan: event.value.span,
            });
            return;
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
function tryParseJSON(usageStr: any) {
  throw new Error("Function not implemented.");
}

