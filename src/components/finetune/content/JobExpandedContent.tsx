/**
 * JobExpandedContent
 *
 * Expanded content panel for a finetune job showing details, hyperparameters, and training metrics.
 */

import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, BarChart3, List } from "lucide-react";
import { FinetuneJob, FinetuneEvalResultsResponse } from "@/services/finetune-api";
import { ErrorLogSection } from "./ErrorLogSection";
import { FinetuneJobDetailsSection } from "./finetune-job-detail/FinetuneJobDetailsSection";
import { PerRowDetailsSection } from "./PerRowDetailsSection";
import { TrainingMetricsSection } from "./TrainingMetricsSection";

interface JobExpandedContentProps {
  job: FinetuneJob;
  evalResults: FinetuneEvalResultsResponse | null;
  isLoadingEvals: boolean;
  isRefreshingEvals: boolean;
  evalsError: string | null;
  onRefreshMetrics: () => void;
}

export function JobExpandedContent({
  job,
  evalResults,
  isLoadingEvals,
  isRefreshingEvals,
  evalsError,
  onRefreshMetrics,
}: JobExpandedContentProps) {

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={5} className="p-0">
        <div className="px-6 py-4 space-y-4">
          {/* Error Log Section */}
          {job.error_message && (
            <ErrorLogSection errorMessage={job.error_message} />
          )}

          {/* Tabs for Job Details, Training Metrics, and Per-Row */}
          {(() => {
            const hasEvalData = evalResults && evalResults.results.length > 0;
            const isFailed = job.status === "failed";
            const showMetricsTabs = job.workflow_id && !(isFailed && !hasEvalData && !isLoadingEvals);

            return (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="h-8">
                  <TabsTrigger value="details" className="text-xs gap-1.5 h-7">
                    <Info className="h-3.5 w-3.5" />
                    Job Details
                  </TabsTrigger>
                  {showMetricsTabs && (
                    <>
                      <TabsTrigger value="metrics" className="text-xs gap-1.5 h-7">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Training Metrics
                      </TabsTrigger>
                      <TabsTrigger value="rows" className="text-xs gap-1.5 h-7">
                        <List className="h-3.5 w-3.5" />
                        Per-Row
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>

                <TabsContent value="details" className="mt-3">
                  <FinetuneJobDetailsSection job={job} />
                </TabsContent>

                {showMetricsTabs && (
                  <>
                    <TabsContent value="metrics" className="mt-3">
                      <TrainingMetricsSection
                        evalResults={evalResults}
                        isLoading={isLoadingEvals}
                        isRefreshing={isRefreshingEvals}
                        error={evalsError}
                        onRefresh={onRefreshMetrics}
                      />
                    </TabsContent>

                    <TabsContent value="rows" className="mt-3">
                      {hasEvalData ? (
                        <PerRowDetailsSection results={evalResults.results} />
                      ) : (
                        <div className="text-xs text-muted-foreground py-2">
                          {isLoadingEvals ? "Loading..." : "Evaluation data will appear as training progresses"}
                        </div>
                      )}
                    </TabsContent>
                  </>
                )}
              </Tabs>
            );
          })()}
        </div>
      </TableCell>
    </TableRow>
  );
}
