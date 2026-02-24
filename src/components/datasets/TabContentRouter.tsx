/**
 * TabContentRouter
 *
 * Maps a virtual file path from the workspace tab to a content section.
 * Returns the section identifier that DatasetDetailContentV2 uses to
 * render the correct content component.
 *
 * Also provides content renderers for new paths that don't map to
 * existing sections (plan.md, readme.md, tasks.md, logs.md).
 */

export type ContentSection =
  | "overview"
  | "records"
  | "evaluator"
  | "jobs"
  | "deploy"
  | "plan"
  | "readme"
  | "documents"
  | "tasks"
  | "logs"
  | null;

/**
 * Map a workspace tab path to a content section identifier.
 * Returns null if the path doesn't map to any section (shouldn't happen).
 */
export function mapTabPathToSection(path: string | null): ContentSection {
  if (!path) return null;

  // Direct section matches
  if (path === "overview") return "overview";
  if (path === "records") return "records";
  if (path === "evaluator") return "evaluator";
  if (path === "jobs") return "jobs";
  if (path === "deploy") return "deploy";

  // Virtual file paths
  if (path === "plan.md") return "plan";
  if (path === "readme.md") return "readme";
  if (path === "tasks.md") return "tasks";
  if (path === "logs.md") return "logs";

  // Folder/file prefix matches
  if (path.startsWith("quick-stats/")) return "overview";
  if (path.startsWith("topics/")) return "records";
  if (path.startsWith("evaluations/")) return "evaluator";
  if (path.startsWith("finetune/")) return "jobs";
  if (path.startsWith("documents/")) return "documents";

  return null;
}

/**
 * Default tabs to open for a new dataset.
 * Returns the paths that should be pre-opened as pinned tabs.
 */
export const DEFAULT_TAB_PATHS = ["overview"] as const;
