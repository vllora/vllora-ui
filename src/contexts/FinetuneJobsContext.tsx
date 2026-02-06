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
  useMemo,
} from "react";
import { useRequest } from "ahooks";
import {
  FinetuneJob,
  FinetuneJobStatus,
  FinetuneEvalResultsResponse,
  listReinforcementJobs,
  getReinforcementJobStatus,
  getFinetuneEvaluations,
} from "@/services/finetune-api";
import {
  getCachedJobEvaluations,
  saveJobEvaluationsCache,
} from "@/services/finetune-workflow-db";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import {
  CustomEvent,
  CustomFinetuneJobUpdateEventType,
} from "@/contexts/project-events/dto";
import { emitter } from "@/utils/eventEmitter";

// ============================================================================
// Types
// ============================================================================

interface JobEvaluationState {
  data: FinetuneEvalResultsResponse | null;
  isLoading: boolean;
  error: string | null;
}

// Poll interval for evaluations (20 seconds)
const EVAL_POLL_INTERVAL = 20000;

// ============================================================================
// Hook
// ============================================================================

export type FinetuneJobsContextType = ReturnType<typeof useFinetuneJobsLogic>;

function useFinetuneJobsLogic() {
  // Sidebar visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dataset filtering - server-side filter via backend dataset ID
  const [currentBackendDatasetId, setCurrentBackendDatasetId] = useState<string | null>(null);

  // Job evaluations state - keyed by job ID
  const [jobEvaluations, setJobEvaluations] = useState<Record<string, JobEvaluationState>>({});
  const evalPollIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Get project events for SSE subscription
  const { subscribe } = ProjectEventsConsumer();
  const subscriptionIdRef = useRef<string>(`finetune-jobs-${Date.now()}`);

  // Use useRequest for jobs fetching with automatic refresh on dependency change
  const {
    data: jobs = [],
    loading: isLoading,
    error,
    run: loadJobs,
    mutate: setJobs,
  } = useRequest(
    async (datasetId?: string | null) => {
      // Use provided datasetId or fall back to current state
      const filterDatasetId = datasetId !== undefined ? datasetId : currentBackendDatasetId;

      // If no backend dataset ID, return empty (dataset not uploaded yet)
      if (!filterDatasetId) {
        return [];
      }

      return listReinforcementJobs(
        undefined, // limit
        undefined, // after
        filterDatasetId // datasetId (server-side filter)
      );
    },
    {
      manual: true, // We'll trigger manually based on currentBackendDatasetId
    }
  );

  // Refresh a specific job by ID
  const refreshJob = useCallback(async (providerJobId: string) => {
    try {
      const updatedJob = await getReinforcementJobStatus(providerJobId);
      setJobs((prevJobs) =>
        (prevJobs || []).map((job) =>
          job.provider_job_id === providerJobId ? updatedJob : job
        )
      );
    } catch (err) {
      console.error(`Failed to refresh job ${providerJobId}:`, err);
    }
  }, [setJobs]);

  // Fetch evaluations for a specific job (stale-while-revalidate pattern)
  const fetchJobEvaluations = useCallback(async (job: FinetuneJob, isInitial = false) => {
    if (!job.dataset_id) return;

    const jobId = job.id;

    // On initial fetch, try to load from cache first (stale-while-revalidate)
    if (isInitial) {
      try {
        const cached = await getCachedJobEvaluations(jobId);
        if (cached) {
          // Show cached data immediately
          setJobEvaluations((prev) => ({
            ...prev,
            [jobId]: { data: cached.data, isLoading: true, error: null },
          }));
        } else {
          setJobEvaluations((prev) => ({
            ...prev,
            [jobId]: { data: prev[jobId]?.data ?? null, isLoading: true, error: null },
          }));
        }
      } catch {
        // Cache read failed, continue with loading state
        setJobEvaluations((prev) => ({
          ...prev,
          [jobId]: { data: prev[jobId]?.data ?? null, isLoading: true, error: null },
        }));
      }
    }

    // Fetch fresh data from API (revalidate)
    try {
      const results = await getFinetuneEvaluations(job.dataset_id, job.provider_job_id);

      // Update state with fresh data
      setJobEvaluations((prev) => ({
        ...prev,
        [jobId]: { data: results, isLoading: false, error: null },
      }));

      // Save to cache in background
      saveJobEvaluationsCache(jobId, results).catch((err) => {
        console.warn('Failed to cache job evaluations:', err);
      });
    } catch (err) {
      setJobEvaluations((prev) => ({
        ...prev,
        [jobId]: {
          data: prev[jobId]?.data ?? null,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load evaluations',
        },
      }));
    }
  }, []);

  // Start polling evaluations for active jobs
  const startEvalPolling = useCallback((job: FinetuneJob) => {
    const jobId = job.id;

    // Don't start if already polling
    if (evalPollIntervalsRef.current[jobId]) return;

    // Initial fetch
    fetchJobEvaluations(job, true);

    // Start polling
    evalPollIntervalsRef.current[jobId] = setInterval(() => {
      fetchJobEvaluations(job);
    }, EVAL_POLL_INTERVAL);
  }, [fetchJobEvaluations]);

  // Stop polling evaluations for a job
  const stopEvalPolling = useCallback((jobId: string) => {
    if (evalPollIntervalsRef.current[jobId]) {
      clearInterval(evalPollIntervalsRef.current[jobId]);
      delete evalPollIntervalsRef.current[jobId];
    }
  }, []);

  // Get evaluation state for a job (triggers polling if active and not already polling)
  const getJobEvaluations = useCallback((jobId: string): JobEvaluationState => {
    const job = jobs.find((j) => j.id === jobId);
    const isActive = job && (job.status === 'pending' || job.status === 'running');

    // Start polling for active jobs that aren't being polled yet
    if (job && isActive && job.dataset_id && !evalPollIntervalsRef.current[jobId]) {
      startEvalPolling(job);
    }

    return jobEvaluations[jobId] ?? { data: null, isLoading: false, error: null };
  }, [jobs, jobEvaluations, startEvalPolling]);

  // Manual refresh evaluations for a job
  const refreshJobEvaluations = useCallback((jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      fetchJobEvaluations(job, false);
    }
  }, [jobs, fetchJobEvaluations]);

  // Start/stop polling based on job status changes
  useEffect(() => {
    for (const job of jobs) {
      const isActive = job.status === 'pending' || job.status === 'running';
      const isPolling = !!evalPollIntervalsRef.current[job.id];

      if (isActive && job.dataset_id && !isPolling) {
        // Job became active, start polling
        startEvalPolling(job);
      } else if (!isActive && isPolling) {
        // Job is no longer active, stop polling (but keep data)
        stopEvalPolling(job.id);
      }
    }
  }, [jobs, startEvalPolling, stopEvalPolling]);

  // Cleanup all polling on unmount
  useEffect(() => {
    return () => {
      for (const jobId of Object.keys(evalPollIntervalsRef.current)) {
        clearInterval(evalPollIntervalsRef.current[jobId]);
      }
    };
  }, []);

  // Handle SSE event for job updates
  const handleJobUpdateEvent = useCallback(
    (event: CustomFinetuneJobUpdateEventType) => {
      const { job_id, status } = event;

      setJobs((prevJobs) => {
        const jobsList = prevJobs || [];
        const existingJob = jobsList.find((j) => j.id === job_id);
        if (existingJob) {
          // Update existing job status
          return jobsList.map((job) =>
            job.id === job_id
              ? { ...job, status: status as FinetuneJobStatus }
              : job
          );
        } else {
          // Job not in list, trigger a full reload
          loadJobs(currentBackendDatasetId);
          return jobsList;
        }
      });
    },
    [loadJobs, setJobs, currentBackendDatasetId]
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

  // Load jobs on mount and when currentBackendDatasetId changes
  useEffect(() => {
    loadJobs(currentBackendDatasetId);
  }, [currentBackendDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for job created events from quickFinetune
  useEffect(() => {
    const handleJobCreated = (event: { backendDatasetId: string }) => {
      // Update the current backend dataset ID and refresh jobs list
      if (event.backendDatasetId) {
        setCurrentBackendDatasetId(event.backendDatasetId);
        // loadJobs will be triggered by the useEffect watching currentBackendDatasetId
      } else {
        loadJobs(currentBackendDatasetId);
      }
      setIsSidebarOpen(true);
    };

    emitter.on("vllora_finetune_job_created", handleJobCreated);
    return () => {
      emitter.off("vllora_finetune_job_created", handleJobCreated);
    };
  }, [loadJobs, currentBackendDatasetId]);

  // Jobs are now filtered server-side, so filteredJobs just returns jobs
  const filteredJobs = jobs;

  // Get the most recent job (sorted by created_at descending)
  const latestJob = useMemo(() => {
    if (filteredJobs.length === 0) return null;
    return [...filteredJobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [filteredJobs]);

  // Track if we've already fetched evaluations for completed jobs (by job ID)
  const completedJobsFetchedRef = useRef<Set<string>>(new Set());

  // Fetch evaluations once for completed latestJob on mount/change
  useEffect(() => {
    if (!latestJob) return;

    const isCompleted = latestJob.status !== 'pending' && latestJob.status !== 'running';
    const alreadyFetched = completedJobsFetchedRef.current.has(latestJob.id);

    if (isCompleted && latestJob.dataset_id && !alreadyFetched) {
      completedJobsFetchedRef.current.add(latestJob.id);
      fetchJobEvaluations(latestJob, true);
    }
  }, [latestJob, fetchJobEvaluations]);

  return {
    jobs,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    loadJobs,
    refreshJob,
    isSidebarOpen,
    setIsSidebarOpen,
    currentBackendDatasetId,
    setCurrentBackendDatasetId,
    filteredJobs,
    latestJob,
    getJobEvaluations,
    refreshJobEvaluations,
  };
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

export function FinetuneJobsProvider({ children }: { children: ReactNode }) {
  const value = useFinetuneJobsLogic();
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
