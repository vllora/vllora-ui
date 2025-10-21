import { useState, useEffect } from "react";
import { ThreadChanges, ThreadState } from "./types";

export function useThreadChanges(threadState: ThreadState) {
  const { selectedThreadId } = threadState;
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


  

  return {
    threadsHaveChanges,
    setThreadsHaveChanges
  };
}
