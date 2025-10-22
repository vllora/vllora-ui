import { ProjectEventsConsumer } from "@/contexts/project-events";
import { ProjectEventUnion } from "@/contexts/project-events/dto";
import { useState, useRef, useCallback, useEffect } from "react";

export function useDebugControl(props: {
  handleEvent: (event: ProjectEventUnion) => void;
  channel_name: string;
}) {
  const { handleEvent, channel_name } = props;
  const { subscribe } = ProjectEventsConsumer();

  const [isPaused, setIsPaused] = useState(false);
  const pausedEventsRef = useRef<ProjectEventUnion[]>([]);
  const handlePause = () => {
    setIsPaused(true);
  };

  const resume = useCallback(() => {
    setIsPaused(false);
    if (pausedEventsRef.current.length > 0) {
      pausedEventsRef.current.forEach(handleEvent);
      pausedEventsRef.current = [];
    }
  }, [handleEvent]);

  useEffect(() => {
    const unsubscribe = subscribe(channel_name, (event: ProjectEventUnion) => {
      if (isPaused) {
        pausedEventsRef.current.push(event);
      } else {
        handleEvent(event);
      }
    });

    return unsubscribe;
  }, [subscribe, channel_name, handleEvent, isPaused]);
  return {
    isPaused,
    handlePause,
    resume,
  };
}
