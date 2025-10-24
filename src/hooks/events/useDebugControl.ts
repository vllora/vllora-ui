import { ProjectEventsConsumer } from "@/contexts/project-events";
import { ProjectEventUnion } from "@/contexts/project-events/dto";
import { useRef, useCallback, useEffect } from "react";
import { useLocalStorageState } from "ahooks";


export const DEBUG_CONTROL_KEY = 'vllora_debug_control_is_paused';
export function useDebugControl(props: {
  handleEvent: (event: ProjectEventUnion) => void;
  channel_name: string;
}) {
  const { handleEvent, channel_name } = props;
  const { subscribe } = ProjectEventsConsumer();

  const [isPaused, setIsPaused] = useLocalStorageState(DEBUG_CONTROL_KEY, {
    defaultValue: false,
    listenStorageChange: true,
  });

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
  }, [handleEvent, setIsPaused]);

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
