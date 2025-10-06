import { useEffect } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  LangDBCustomEvent,
  LangDBEventSpan,
  ProjectEventUnion,
  ThreadModelStartEvent,
} from "@/contexts/project-events/dto";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";

export function useTraceEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const { addEventSpans, upsertRun } = ChatWindowConsumer();
  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-trace-events",
      (event: ProjectEventUnion) => {
        if (event.type === "Custom") {
          const customEvent = event as LangDBCustomEvent;

          if (
            customEvent.name === "span_end" &&
            customEvent.thread_id &&
            customEvent.thread_id === currentThreadId
          ) {
            let eventValue = event.value as { span: LangDBEventSpan };
            if (eventValue && eventValue.span) {
              addEventSpans([eventValue.span]);
            }
            return;
          }
          if (
            customEvent.name === "model_start" &&
            customEvent.thread_id &&
            customEvent.thread_id === currentThreadId
          ) {
            let modelStartEvent = event as ThreadModelStartEvent;
            upsertRun({
              runId: modelStartEvent.run_id,
              threadId: modelStartEvent.thread_id,
              timestamp: modelStartEvent.timestamp,
              request_models: [
                `${modelStartEvent.value.provider_name}/${modelStartEvent.value.model_name}`,
              ],
              used_models: [
                `${modelStartEvent.value.provider_name}/${modelStartEvent.value.model_name}`,
              ],
            });
            return;
          }
        }

        if (
          event &&
          event.run_id &&
          event.thread_id &&
          event.thread_id === currentThreadId
        ) {
          upsertRun({
            runId: event.run_id,
            threadId: event.thread_id,
            timestamp: event.timestamp,
          });
          return;
        }
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId]);
}
