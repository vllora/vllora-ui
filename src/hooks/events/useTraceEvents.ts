import { useEffect } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  ProjectEventUnion,
} from "@/contexts/project-events/dto";

export function useTraceEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-trace-events",
      (event: ProjectEventUnion) => {
        
      }
    );
    return unsubscribe;
  }, [subscribe, currentProjectId, currentThreadId]);
}
