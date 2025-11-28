import { useSearchParams } from "react-router";
import { ExperimentHeader } from "@/components/experiment/ExperimentHeader";
import { ExperimentFooterControls } from "@/components/experiment/ExperimentFooterControls";
import { ExperimentMainContent } from "@/components/experiment/ExperimentMainContent";
import { ExperimentLoadingState } from "@/components/experiment/ExperimentLoadingState";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { ExperimentProvider, ExperimentConsumer } from "@/contexts/ExperimentContext";

export const ExperimentPage = () => {
  const [searchParams] = useSearchParams();
  const spanId = searchParams.get("span_id");
  const { currentProjectId } = ProjectsConsumer();

  return (
    <ExperimentProvider spanId={spanId} projectId={currentProjectId || ""}>
      <ExperimentPageContent />
    </ExperimentProvider>
  );
};

function ExperimentPageContent() {
  const { loading } = ExperimentConsumer();

  if (loading) {
    return <ExperimentLoadingState />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <ExperimentHeader />
      <ExperimentMainContent />
      <ExperimentFooterControls />
    </div>
  );
}
