import { useState, useCallback, useEffect } from "react";
import {
  TextMessageStartEvent,
  TextMessageEndEvent,
  TextMessageContentEvent,
  MessageCreatedEvent,
  ThreadModelStartEvent,
} from "../project-events/dto";
import { ThreadChanges, ThreadState } from "./types";
import { sortThreads, formatTimestampToDateString } from "./utils";

export function useThreadChanges(threadState: ThreadState) {
  const { setThreads, selectedThreadId } = threadState;
  const [threadsHaveChanges, setThreadsHaveChanges] = useState<ThreadChanges>(
    {}
  );

  // Clear thread changes when user selects/views a thread
  useEffect(() => {
    if (selectedThreadId) {
      setThreadsHaveChanges((prev) => {
        const updated = { ...prev };
        delete updated[selectedThreadId];
        return updated;
      });
    }
  }, [selectedThreadId]);

  // Helper to get status from event type
  const getStatus = (type: string): "start" | "streaming" | "end" =>
    type === "TextMessageStart"
      ? "start"
      : type === "TextMessageContent"
      ? "streaming"
      : "end";

  const onThreadMessageHaveChanges = useCallback(
    (input: {
      threadId: string;
      event:
        | TextMessageStartEvent
        | TextMessageEndEvent
        | TextMessageContentEvent;
    }) => {
      const { threadId, event } = input;

      if (selectedThreadId === threadId) {
        setThreadsHaveChanges((prev) => {
          const updated = { ...prev };
          delete updated[threadId];
          return updated;
        });
        return;
      }

      // Create new message entry
      const newMessage = {
        message_id: event.message_id,
        status: getStatus(event.type),
        timestamp: event.timestamp,
      };
      setThreadsHaveChanges((prev) => {
        // Get existing messages, filter out old entry for this message_id, add new entry, and sort
        const existingMessages = prev[threadId]?.messages || [];
        const updatedMessages = [
          ...existingMessages.filter((m) => m.message_id !== event.message_id),
          newMessage,
        ].sort((a, b) => b.timestamp - a.timestamp);

        return {
          ...prev,
          [threadId]: { messages: updatedMessages },
        };
      });

      // Update thread timestamp
      const newUpdatedAtString = formatTimestampToDateString(event.timestamp);
      setThreads((prev) => {
        const updatedThreads = prev.map((thread) =>
          thread.id === threadId
            ? { ...thread, updated_at: newUpdatedAtString }
            : thread
        );
        return sortThreads(updatedThreads);
      });
    },
    [setThreads, selectedThreadId]
  );

  const onThreadModelStartEvent = useCallback(
    (input: { threadId: string; event: ThreadModelStartEvent }) => {
      const { threadId, event } = input;
      const newUpdatedAtString = formatTimestampToDateString(event.timestamp);

      setThreads((prev) => {
        const updatedThreads = prev.map((thread) => {
          if (thread.id === threadId) {
            // Create unique array of input models with new model added
            let newModelName = event.value.provider_name
              ? `${event.value.provider_name}/${event.value.model_name}`
              : event.value.model_name;
            const newInputModels = [
              ...new Set([...(thread.input_models || []), newModelName]),
            ];
            return {
              ...thread,
              updated_at: newUpdatedAtString,
              input_models: newInputModels,
              request_model_name: newModelName,
            };
          }
          return thread;
        });
        return sortThreads(updatedThreads);
      });
    },
    [setThreads]
  );

  const onThreadMessageCreated = useCallback(
    (input: { threadId: string; event: MessageCreatedEvent }) => {
      const { threadId, event } = input;

      // Create new message entry
      const newMessage = {
        message_id: event.value.message_id,
        status: "end" as const,
        timestamp: event.timestamp,
      };

      selectedThreadId !== threadId &&
        setThreadsHaveChanges((prev) => {
          // Get existing messages, filter out old entry for this message_id, add new entry, and sort
          const existingMessages = prev[threadId]?.messages || [];
          const updatedMessages = [
            ...existingMessages.filter(
              (m) => m.message_id !== event.value.message_id
            ),
            newMessage,
          ].sort((a, b) => b.timestamp - a.timestamp);

          return {
            ...prev,
            [threadId]: { messages: updatedMessages },
          };
        });

      // Update thread timestamp
      const newUpdatedAtString = formatTimestampToDateString(event.timestamp);
      setThreads((prev) => {
        const updatedThreads = prev.map((thread) =>
          thread.id === threadId
            ? { ...thread, updated_at: newUpdatedAtString }
            : thread
        );
        return sortThreads(updatedThreads);
      });
    },
    [setThreads, selectedThreadId]
  );

  return {
    threadsHaveChanges,
    setThreadsHaveChanges,
    onThreadMessageHaveChanges,
    onThreadModelStartEvent,
    onThreadMessageCreated,
  };
}
