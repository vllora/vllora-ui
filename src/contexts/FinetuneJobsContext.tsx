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
  listFinetuneJobs,
  getFinetuneJobStatus,
  getFinetuneEvaluations,
} from "@/services/finetune-api";
import { workflowService } from "@/services/service-registry";
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

// Evaluation polling removed — SSE events trigger on-demand cloud-proxy fetches

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Hook
// ============================================================================

export type FinetuneJobsContextType = ReturnType<typeof useFinetuneJobsLogic>;

function useFinetuneJobsLogic() {
  // Sidebar visibility state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dataset filtering - server-side filter via dataset ID
  const [currentDatasetId, setCurrentDatasetId] = useState<string | null>(null);

  // Job evaluations state - keyed by job ID
  const [jobEvaluations, setJobEvaluations] = useState<Record<string, JobEvaluationState>>({});
  /** Active polling intervals for finetune evaluations, keyed by job ID */
  const evalPollIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Get project events for SSE subscription
  const { subscribe, isConnected } = ProjectEventsConsumer();
  const subscriptionIdRef = useRef<string>(`finetune-jobs-${Date.now()}`);
  const wasConnectedRef = useRef(false);

  // Use useRequest for jobs fetching with automatic refresh on dependency change
  const {
    data: jobs = [],
    loading: isLoading,
    error,
    run: loadJobs,
    mutate: setJobs,
  } = useRequest(
    async (workflowId?: string | null) => {
      // Use provided workflowId or fall back to current state
      const filterDatasetId = workflowId !== undefined ? workflowId : currentDatasetId;

      // If no backend dataset ID, return empty (dataset not uploaded yet)
      if (!filterDatasetId) {
        return [];
      }

      return listFinetuneJobs(
        filterDatasetId, // workflowId (scopes the listing)
      );
    },
    {
      manual: true, // We'll trigger manually based on currentDatasetId
    }
  );

  // Refresh a specific job by ID
  const refreshJob = useCallback(async (providerJobId: string) => {
    if (!currentDatasetId) return;
    try {
      const updatedJob = await getFinetuneJobStatus(currentDatasetId, providerJobId);
      setJobs((prevJobs) =>
        (prevJobs || []).map((job) =>
          job.provider_job_id === providerJobId ? updatedJob : job
        )
      );
    } catch (err) {
      console.error(`Failed to refresh job ${providerJobId}:`, err);
    }
  }, [setJobs, currentDatasetId]);

  // Fetch evaluations for a specific job (stale-while-revalidate pattern)
  const fetchJobEvaluations = useCallback(async (job: FinetuneJob, isInitial = false) => {
    if (!job.workflow_id) return;

    const jobId = job.id;

    // On initial fetch, try to load from cache first (stale-while-revalidate)
    if (isInitial) {
      try {
        const cached = await workflowService.getCachedJobEvaluations(jobId);
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
      const results = await getFinetuneEvaluations(job.workflow_id, job.provider_job_id);

      // Update state with fresh data
      setJobEvaluations((prev) => ({
        ...prev,
        [jobId]: { data: results, isLoading: false, error: null },
      }));

      // Save to cache in background
      workflowService.saveJobEvaluationsCache(jobId, results).catch((cacheErr: unknown) => {
        console.warn('Failed to cache job evaluations:', cacheErr);
      });

      // Per-record score persistence is handled by the gateway, not the FE.
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

  // Get evaluation state for a job
  const getJobEvaluations = useCallback((jobId: string): JobEvaluationState => {
    return jobEvaluations[jobId] ?? { data: null, isLoading: false, error: null };
  }, [jobEvaluations]);

  // Manual refresh evaluations for a job (on-demand cloud-proxy fetch)
  const refreshJobEvaluations = useCallback((jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      fetchJobEvaluations(job, false);
    }
  }, [jobs, fetchJobEvaluations]);

  const stopEvalPolling = useCallback((jobId: string) => {
    if (evalPollIntervalsRef.current[jobId]) {
      clearInterval(evalPollIntervalsRef.current[jobId]);
      delete evalPollIntervalsRef.current[jobId];
    }
  }, []);

  // Start polling cloud-proxy for finetune evaluations while job is active
  const startEvalPolling = useCallback((job: FinetuneJob) => {
    const jobId = job.id;
    if (evalPollIntervalsRef.current[jobId]) return;

    // Initial fetch
    fetchJobEvaluations(job, true);

    // Poll cloud-proxy every 20s for progress (with stop condition)
    evalPollIntervalsRef.current[jobId] = setInterval(() => {
      // Check current job status — stop if no longer active
      const currentJob = jobs.find((j) => j.id === jobId);
      if (!currentJob || (currentJob.status !== 'pending' && currentJob.status !== 'running')) {
        stopEvalPolling(jobId);
        return;
      }
      fetchJobEvaluations(job);
    }, 20_000);
  }, [fetchJobEvaluations, jobs, stopEvalPolling]);

  // Start/stop eval polling based on job status
  useEffect(() => {
    for (const job of jobs) {
      const isActive = job.status === 'pending' || job.status === 'running';
      const isPolling = !!evalPollIntervalsRef.current[job.id];

      if (isActive && job.workflow_id && !isPolling) {
        startEvalPolling(job);
      } else if (!isActive && isPolling) {
        stopEvalPolling(job.id);
      }
    }
  }, [jobs, startEvalPolling, stopEvalPolling]);

  // Cleanup polling on unmount
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
      const newStatus = status as FinetuneJobStatus;
      const isTerminal = newStatus === 'succeeded' || newStatus === 'failed' || newStatus === 'cancelled';

      setJobs((prevJobs) => {
        const jobsList = prevJobs || [];
        const existingJob = jobsList.find((j) => j.id === job_id);
        if (existingJob) {
          // Detect completion transition: was running/pending → now terminal
          const wasActive = existingJob.status === 'running' || existingJob.status === 'pending';
          if (wasActive && isTerminal && existingJob.workflow_id) {
            emitter.emit('vllora_finetune_job_completed', {
              jobId: job_id,
              workflowId: existingJob.workflow_id,
            });
          }

          // Update existing job status
          return jobsList.map((job) =>
            job.id === job_id
              ? { ...job, status: newStatus }
              : job
          );
        } else {
          // Job not in list, trigger a full reload
          loadJobs(currentDatasetId);
          return jobsList;
        }
      });

    },
    [loadJobs, setJobs, currentDatasetId]
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

  // Load jobs on mount and when currentDatasetId changes
  useEffect(() => {
    loadJobs(currentDatasetId);
  }, [currentDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for job created events from quickFinetune
  useEffect(() => {
    const handleJobCreated = (event: { workflowId: string }) => {
      // Update the current dataset ID if it changed
      const targetId = event.workflowId || currentDatasetId;
      if (event.workflowId && event.workflowId !== currentDatasetId) {
        setCurrentDatasetId(event.workflowId);
        // useEffect watching currentDatasetId will call loadJobs
      } else {
        // Same dataset — refresh directly (setCurrentDatasetId would be a no-op)
        loadJobs(targetId);
      }
      setIsSidebarOpen(true);
    };

    emitter.on("vllora_finetune_job_created", handleJobCreated);
    return () => {
      emitter.off("vllora_finetune_job_created", handleJobCreated);
    };
  }, [loadJobs, currentDatasetId]);

  // Jobs are now filtered server-side, so filteredJobs just returns jobs
  const filteredJobs = jobs;

  // Get the most recent job (sorted by created_at descending)
  const latestJob = useMemo(() => {
    if (filteredJobs.length === 0) return null;
    return [...filteredJobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [filteredJobs]);

  // Track jobs whose evaluations have already been fetched (by job ID)
  const evalsFetchedRef = useRef<Set<string>>(new Set());

  // Fetch evaluations once per job on mount/change (active + completed)
  useEffect(() => {
    for (const job of filteredJobs) {
      if (!job.workflow_id || evalsFetchedRef.current.has(job.id)) continue;

      evalsFetchedRef.current.add(job.id);
      fetchJobEvaluations(job, true);
    }
  }, [filteredJobs, fetchJobEvaluations]);

  // Re-fetch jobs on SSE reconnect (covers BE restart gap)
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      loadJobs(currentDatasetId);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, loadJobs, currentDatasetId]);

  return {
    jobs,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    loadJobs,
    refreshJob,
    isSidebarOpen,
    setIsSidebarOpen,
    currentDatasetId,
    setCurrentDatasetId,
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
