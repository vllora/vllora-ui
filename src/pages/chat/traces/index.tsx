import { TracesPageContent } from "./content";
import { TracesPageProvider } from "@/contexts/TracesPageContext";
import { ProjectsConsumer } from "@/contexts/ProjectContext";



export function TracesPage() {
  const { currentProjectId } = ProjectsConsumer();
  return <TracesPageProvider projectId={currentProjectId || ''}> <TracesPageContent /> </TracesPageProvider>;
}