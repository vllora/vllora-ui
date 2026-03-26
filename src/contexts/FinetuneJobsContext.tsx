/**
 * FinetuneJobsContext
 *
 * Manages state for finetune jobs with polling-based status detection.
 * FE polls BE (listFinetuneJobs) every 15s for status changes.
 * SSE removed — BE state tracker writes status + scores to SQLite,
 * FE polls to detect transitions.
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

import { ProjectEventsConsumer } from "@/contexts/project-events";
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

  // SSE reconnect detection (re-fetch jobs after gateway restart)
  const { isConnected } = ProjectEventsConsumer();
  const wasConnectedRef = useRef(isConnected);

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

  // Fetch evaluations for a specific finetune job from the cloud API
  const fetchJobEvaluations = useCallback(async (job: FinetuneJob, _isInitial = false) => {
    if (!job.workflow_id) return;

    const jobId = job.id;

    setJobEvaluations((prev) => ({
      ...prev,
      [jobId]: { data: prev[jobId]?.data ?? null, isLoading: true, error: null },
    }));

    try {
      const results = await getFinetuneEvaluations(job.workflow_id, job.provider_job_id);

      setJobEvaluations((prev) => ({
        ...prev,
        [jobId]: { data: results, isLoading: false, error: null },
      }));
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

  // Poll BE for job status changes (replaces SSE subscription)
  const prevStatusesRef = useRef<Record<string, FinetuneJobStatus>>({});
  const hasActiveJobsRef = useRef(false);

  // Track whether there are active jobs (avoids jobs in useEffect deps)
  useEffect(() => {
    hasActiveJobsRef.current = jobs.some(
      (j) => j.status === 'pending' || j.status === 'running'
    );
  }, [jobs]);

  useEffect(() => {
    if (!currentDatasetId) return;

    const interval = setInterval(async () => {
      if (!hasActiveJobsRef.current) return;

      try {
        const freshJobs = await listFinetuneJobs(currentDatasetId);
        const prevStatuses = prevStatusesRef.current;

        // Detect completion transitions
        for (const freshJob of freshJobs) {
          const prevStatus = prevStatuses[freshJob.id];
          const isTerminal = freshJob.status === 'succeeded' || freshJob.status === 'failed' || freshJob.status === 'cancelled';
          const wasActive = prevStatus === 'running' || prevStatus === 'pending';

          if (wasActive && isTerminal && freshJob.workflow_id) {
            emitter.emit('vllora_finetune_job_completed', {
              jobId: freshJob.id,
              workflowId: freshJob.workflow_id,
            });
          }
        }

        // Update prev statuses
        const newStatuses: Record<string, FinetuneJobStatus> = {};
        for (const j of freshJobs) {
          newStatuses[j.id] = j.status;
        }
        prevStatusesRef.current = newStatuses;

        setJobs(freshJobs);
      } catch (err) {
        console.error('[FinetuneJobsContext] Status poll failed:', err);
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [currentDatasetId]);

  // Load jobs on mount and when currentDatasetId changes
  useEffect(() => {
    loadJobs(currentDatasetId);
  }, [currentDatasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed prevStatusesRef whenever jobs list changes (so polling can detect transitions)
  useEffect(() => {
    const statuses: Record<string, FinetuneJobStatus> = {};
    for (const j of jobs) {
      statuses[j.id] = j.status;
    }
    prevStatusesRef.current = statuses;
  }, [jobs]);

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

  // Re-fetch jobs on reconnect (covers BE restart gap)
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
