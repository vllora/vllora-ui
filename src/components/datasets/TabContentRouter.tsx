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
  | "evaluator-script"
  | "evaluator-jobs"
  | "evaluator-overview"
  | "finetune-overview"
  | "jobs"
  | "deploy"
  | "plan"
  | "readme"
  | "knowledge"
  | "tasks"
  | "logs"
  | "insights"
  | "skill"
  | "trace-analysis"
  | "trace-influence"
  | "pipeline-analysis"
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
  if (path === "insights") return "insights";
  if (path.startsWith("insights/")) return "insights";
  if (path === "data") return "records";
  if (path.startsWith("data/")) return "records";
  if (path === "evaluations/grader-script.ts") return "evaluator-script";
  if (path === "evaluations/overview") return "evaluator-overview";
  if (path.startsWith("evaluations/jobs")) return "evaluator-jobs";
  if (path === "evaluations") return "evaluator";
  if (path.startsWith("evaluations/")) return "evaluator";
  if (path === "finetune/overview") return "finetune-overview";
  if (path === "finetune") return "jobs";
  if (path.startsWith("finetune/")) return "jobs";
  if (path === "knowledge") return "knowledge";
  if (path.startsWith("knowledge/")) return "knowledge";
  if (path === "skill") return "skill";
  if (path.startsWith("skill/")) return "skill";
  if (path === "trace-analysis") return "trace-analysis";
  if (path.startsWith("trace-analysis/")) return "trace-analysis";
  if (path === "trace-influence") return "trace-influence";
  if (path === "pipeline-analysis") return "pipeline-analysis";
  if (path.startsWith("pipeline-analysis/")) return "pipeline-analysis";

  return null;
}

/**
 * Extract insight type from an explorer path like `insights/coverage.md`.
 * Returns the insight type ("coverage", "balance", "quality-scores") or null.
 */
export function getInsightTypeFromPath(path: string | null): "coverage" | "balance" | "quality-scores" | null {
  if (!path) return null;
  if (path === "insights/coverage.md") return "coverage";
  if (path === "insights/balance.md") return "balance";
  if (path === "insights/quality-scores.md") return "quality-scores";
  return null;
}

/**
 * Extract trace analysis tab from an explorer path like `trace-analysis/priority`.
 * Returns the tab name or "priority" as default.
 */
export function getTraceAnalysisTab(path: string | null): "priority" | "grader-hints" | "seed-queries" {
  if (path === "trace-analysis/grader-hints") return "grader-hints";
  if (path === "trace-analysis/seed-queries") return "seed-queries";
  return "priority";
}

/**
 * Extract dry-run job ID from an explorer path like `evaluations/jobs/<jobId>`.
 * Returns null for the jobs folder path (`evaluations/jobs`) or non-job paths.
 */
export function getDryRunJobIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const prefix = "evaluations/jobs/";
  if (!path.startsWith(prefix)) return null;

  const jobId = path.slice(prefix.length).trim();
  if (!jobId || jobId.includes("/")) return null;
  return jobId;
}

/**
 * Extract finetune job ID from an explorer path like `finetune/<jobId>`.
 * Returns null for the folder path (`finetune`) or non-job paths.
 */
export function getFinetuneJobIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const prefix = "finetune/";
  if (!path.startsWith(prefix)) return null;

  const jobId = path.slice(prefix.length).trim();
  if (!jobId || jobId.includes("/")) return null;
  return jobId;
}

/**
 * Extract skill file path from an explorer path like `skill/SKILL.md`
 * or `skill/resources/using-joins.jsonl`.
 * Returns the relative path within the skill package (e.g., "SKILL.md",
 * "resources/using-joins.jsonl"), or null for the folder root.
 */
export function getSkillFileFromPath(path: string | null): string | null {
  if (!path) return null;
  const prefix = "skill/";
  if (!path.startsWith(prefix)) return null;

  const filePath = path.slice(prefix.length).trim();
  if (!filePath) return null;
  return filePath;
}

/**
 * Extract knowledge source ID from `knowledge/{sourceId}`.
 * Returns null for the folder path itself or invalid paths.
 */
export function getKnowledgeSourceIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const prefix = "knowledge/";
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).trim();
  if (!rest) return null;
  // Return just the sourceId (first segment)
  const slashIdx = rest.indexOf("/");
  return slashIdx === -1 ? rest : rest.slice(0, slashIdx);
}

/**
 * Extract knowledge part ID from `knowledge/{sourceId}/{partId}`.
 * Returns null if path doesn't include a part ID.
 */
export function getKnowledgePartIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const prefix = "knowledge/";
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).trim();
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  const partId = rest.slice(slashIdx + 1).trim();
  return partId || null;
}
