/**
 * FinetuneJobsContext
 *
 * Manages state for finetune jobs with real-time SSE updates.
 * Provides job list, loading state, and methods to refresh jobs.
 */

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  FinetuneJob,
  FinetuneJobStatus,
  listReinforcementJobs,
  getReinforcementJobStatus,
} from "@/services/finetune-api";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  CustomEvent,
  CustomFinetuneJobUpdateEventType,
} from "@/contexts/project-events/dto";
import { emitter } from "@/utils/eventEmitter";

// ============================================================================
// Types
// ============================================================================

interface FinetuneJobsContextType {
  jobs: FinetuneJob[];
  isLoading: boolean;
  error: string | null;
  loadJobs: (datasetId?: string | null) => Promise<void>;
  refreshJob: (jobId: string) => Promise<void>;
  // Sidebar visibility state
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  // Dataset filtering - server-side filter via backend dataset ID
  currentBackendDatasetId: string | null;
  setCurrentBackendDatasetId: (backendDatasetId: string | null) => void;
  filteredJobs: FinetuneJob[];
}

// ============================================================================
// Context
// ============================================================================

const FinetuneJobsContext = createContext<FinetuneJobsContextType | undefined>(
  undefined
);

// ============================================================================
// Provider
// ============================================================================

interface FinetuneJobsProviderProps {
  children: ReactNode;
}

export function FinetuneJobsProvider({ children }: FinetuneJobsProviderProps) {
  const [jobs, setJobs] = useState<FinetuneJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentBackendDatasetId, setCurrentBackendDatasetId] = useState<string | null>(null);

  // Get project events for SSE subscription
  const { subscribe } = ProjectEventsConsumer();
  const subscriptionIdRef = useRef<string>(`finetune-jobs-${Date.now()}`);

  // Load jobs from backend (optionally filtered by dataset)
  const loadJobs = useCallback(async (datasetId?: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      // Use provided datasetId or fall back to current state
      const filterDatasetId = datasetId !== undefined ? datasetId : currentBackendDatasetId;
      const fetchedJobs = await listReinforcementJobs(
        undefined, // limit
        undefined, // after
        filterDatasetId || undefined // datasetId (server-side filter)
      );
      setJobs(fetchedJobs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load jobs";
      setError(message);
      console.error("Failed to load finetune jobs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentBackendDatasetId]);

  // Refresh a specific job by ID
  const refreshJob = useCallback(async (providerJobId: string) => {
    try {
      const updatedJob = await getReinforcementJobStatus(providerJobId);
      setJobs((prevJobs) =>
        prevJobs.map((job) =>
          job.provider_job_id === providerJobId ? updatedJob : job
        )
      );
    } catch (err) {
      console.error(`Failed to refresh job ${providerJobId}:`, err);
    }
  }, []);

  // Handle SSE event for job updates
  const handleJobUpdateEvent = useCallback(
    (event: CustomFinetuneJobUpdateEventType) => {
      const { job_id, status } = event;

      setJobs((prevJobs) => {
        const existingJob = prevJobs.find((j) => j.id === job_id);
        if (existingJob) {
          // Update existing job status
          return prevJobs.map((job) =>
            job.id === job_id
              ? { ...job, status: status as FinetuneJobStatus }
              : job
          );
        } else {
          // Job not in list, trigger a full reload
          loadJobs();
          return prevJobs;
        }
      });
    },
    [loadJobs]
  );

  // Subscribe to SSE events
  useEffect(() => {
    const unsubscribe = subscribe(
      subscriptionIdRef.current,
      (event) => {
        if (event.type === "Custom") {
          const customEvent = event as CustomEvent;
          if (customEvent.event.type === "finetune_job_update") {
            handleJobUpdateEvent(
              customEvent.event as CustomFinetuneJobUpdateEventType
            );
          }
        }
      },
      // Filter to only receive Custom events
      (event) => event.type === "Custom"
    );

    return () => {
      unsubscribe();
    };
  }, [subscribe, handleJobUpdateEvent]);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload jobs when currentBackendDatasetId changes (server-side filtering)
  useEffect(() => {
    loadJobs(currentBackendDatasetId);
  }, [currentBackendDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for job created events from DatasetDetailContext
  useEffect(() => {
    const handleJobCreated = () => {
      // Refresh jobs list and open sidebar
      loadJobs();
      setIsSidebarOpen(true);
    };

    emitter.on("vllora_finetune_job_created", handleJobCreated);
    return () => {
      emitter.off("vllora_finetune_job_created", handleJobCreated);
    };
  }, [loadJobs]);

  // Jobs are now filtered server-side, so filteredJobs just returns jobs
  const filteredJobs = jobs;

  const value: FinetuneJobsContextType = {
    jobs,
    isLoading,
    error,
    loadJobs,
    refreshJob,
    isSidebarOpen,
    setIsSidebarOpen,
    currentBackendDatasetId,
    setCurrentBackendDatasetId,
    filteredJobs,
  };

  return (
    <FinetuneJobsContext.Provider value={value}>
      {children}
    </FinetuneJobsContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function FinetuneJobsConsumer() {
  const context = useContext(FinetuneJobsContext);
  if (context === undefined) {
    throw new Error(
      "FinetuneJobsConsumer must be used within a FinetuneJobsProvider"
    );
  }
  return context;
}

// ============================================================================
// Hook (alias for Consumer)
// ============================================================================

export const useFinetuneJobs = FinetuneJobsConsumer;
