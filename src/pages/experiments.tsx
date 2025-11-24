import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ExperimentsConsumer } from "@/contexts/ExperimentsContext";
import type { Experiment } from "@/services/experiments-api";

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "running":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
};

export const ExperimentsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project_id");

  const { experiments, loading, handleDeleteExperiment } = ExperimentsConsumer();

  const handleViewExperiment = (experiment: Experiment) => {
    navigate(`/experiment?span_id=${experiment.original_span_id}`);
  };

  const onDeleteClick = async (id: string) => {
    if (!confirm("Are you sure you want to delete this experiment?")) return;
    await handleDeleteExperiment(id);
  };

  if (loading) {
    return (
      <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading experiments...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-primary" />
              Experiments
            </h1>
            <p className="text-muted-foreground mt-2">
              Create and manage request variations to optimize your prompts
            </p>
          </div>
        </div>

        {/* Empty State */}
        {experiments.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
            <Sparkles className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No experiments yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start experimenting by opening a trace and clicking the "Experiment" button
              on any model invocation span
            </p>
            <Button onClick={() => navigate(`/chat${projectId ? `?project_id=${projectId}` : ""}`)}>
              Go to Chat & Traces
            </Button>
          </div>
        ) : (
          /* Experiments List */
          <div className="space-y-4">
            {experiments.map((experiment) => (
              <div
                key={experiment.id}
                className="border border-border rounded-lg p-6 bg-card hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold truncate">
                        {experiment.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          experiment.status
                        )}`}
                      >
                        {experiment.status}
                      </span>
                    </div>
                    {experiment.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {experiment.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Created {formatDistanceToNow(new Date(experiment.created_at))} ago
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        Span: {experiment.original_span_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewExperiment(experiment)}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteClick(experiment.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 p-4 border border-border rounded-lg bg-muted/50">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            How to create experiments
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Go to Chat & Traces and open any conversation</li>
            <li>Click on a model invocation span to view details</li>
            <li>Click the "Experiment" button to start tweaking the request</li>
            <li>Modify messages, parameters, or model to test variations</li>
            <li>Run and compare results with the original output</li>
          </ul>
        </div>
      </div>
    </section>
  );
};
