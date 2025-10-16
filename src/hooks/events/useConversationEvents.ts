import { useEffect } from "react";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import { ProjectEventUnion } from "@/contexts/project-events/dto";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { processEvent } from "./utilities";

export function useConversationEvents(props: {
  currentProjectId: string;
  currentThreadId: string;
}) {
  const { subscribe } = ProjectEventsConsumer();
  const { currentProjectId, currentThreadId } = props;
  const {setTyping, setFlattenSpans } = ChatWindowConsumer();

  useEffect(() => {
    const unsubscribe = subscribe(
      "chat-conversation-events",
      (event: ProjectEventUnion) => {
        if (event.thread_id !== currentThreadId) {
          return;
        }
        if(event.type === "TextMessageContent") {
          setTyping(true);
        }
        if(event.type === "TextMessageEnd") {
          setTyping(false);
        }
        setTimeout(() => {
          setFlattenSpans((currentSpans) => processEvent(currentSpans, event));
        }, 0);
      }
    );
    return unsubscribe;
  }, [
    subscribe,
    currentProjectId,
    currentThreadId
  ]);
}
