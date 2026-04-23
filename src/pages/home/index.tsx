/**
 * HomePage
 *
 * Branches on whether any workflows exist:
 *   - empty → `<FinetuneHome />` welcome + pipeline diagram + starting-paths
 *   - populated → `<HomeDashboard />` greeting + workflow cards + activity feed
 *
 * Both surfaces are rendered within the same page chrome.
 */

import { useEffect } from "react";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { FinetuneHome } from "./FinetuneHome";
import { HomeDashboard } from "./HomeDashboard";

export function HomePage() {
  // Mounted only for its side effects (project context init).
  const projects = ProjectsConsumer();
  const { datasets, isLoading, loadDatasets } = DatasetsConsumer();

  // Refresh on mount so deleted/created workflows show up immediately.
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const hasWorkflows = datasets.length > 0;
  const currentProject = projects.projects.find((p) => p.id === projects.currentProjectId);

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full h-full relative">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-500),0.08)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute top-[200px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(var(--theme-400),0.04)_0%,transparent_60%)] blur-xl" />

      <div className="relative z-10 flex h-full w-full items-start justify-center">
        {isLoading && !hasWorkflows ? null : hasWorkflows ? (
          <HomeDashboard datasets={datasets} projectName={currentProject?.name} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FinetuneHome />
          </div>
        )}
      </div>
    </section>
  );
}
