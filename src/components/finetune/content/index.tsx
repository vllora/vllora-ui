/**
 * FinetuneJobsContent
 *
 * Table-based display for finetune jobs with expandable rows.
 * Uses dialog for creating new finetune jobs with configurable parameters.
 */

import { useState, useCallback } from "react";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Sparkles,
  Plus,
} from "lucide-react";
import { FinetuneJobTableRow } from "./FinetuneJobTableRow";
import { NewJobDialog } from "./NewJobDialog";
import type { TrainingEvalContext } from "./NewJobDialog";
import type { SampleTrainingConfig } from "@/types/dataset-types";

interface FinetuneJobsContentProps {
  workflowId?: string;
  canCreateJob?: boolean;
  /** Initial training config from dataset (e.g., from sample) */
  trainingConfig?: SampleTrainingConfig;
  /** Eval context for the new job dialog */
  evalContext?: TrainingEvalContext;
}

export function FinetuneJobsContent({ workflowId, canCreateJob = true, trainingConfig, evalContext }: FinetuneJobsContentProps) {
  const { filteredJobs, isLoading, error, loadJobs } = FinetuneJobsConsumer();
  const [showNewJobDialog, setShowNewJobDialog] = useState(false);

  // Calculate active jobs count from filtered jobs
  const activeJobsCount = filteredJobs.filter(
    (job) => job.status === 'pending' || job.status === 'running'
  ).length;
  const hasActiveJob = activeJobsCount > 0;
  const canStartNewJob = canCreateJob && workflowId && !hasActiveJob;

  const handleJobCreated = useCallback(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Finetune Jobs</span>
          {filteredJobs.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {filteredJobs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {workflowId && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-500))] text-white"
              onClick={() => setShowNewJobDialog(true)}
              disabled={!canStartNewJob}
              title={hasActiveJob ? "A job is already in progress" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              New Job
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => loadJobs()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && filteredJobs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="m-4 flex items-center gap-2 p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No finetune jobs yet</p>
            <p className="text-xs mt-1 max-w-xs mx-auto">
              {workflowId
                ? "Click 'New Job' to start a finetune job"
                : "Start a finetune job using the Finetune button to see your jobs here"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px]">Run Name / ID</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[180px]">Base Model</TableHead>
                <TableHead className="w-[140px]">Duration</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <FinetuneJobTableRow key={job.id} job={job} onJobAction={loadJobs} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New Job Dialog */}
      {workflowId && (
        <NewJobDialog
          workflowId={workflowId}
          onSuccess={handleJobCreated}
          disabled={hasActiveJob}
          open={showNewJobDialog}
          onOpenChange={setShowNewJobDialog}
          initialConfig={trainingConfig}
          evalContext={evalContext}
        />
      )}
    </div>
  );
}
