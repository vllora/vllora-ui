/**
 * Generate Topics Tool
 *
 * Auto-generates topic hierarchy from dataset content.
 */

import type { DistriFnTool } from "@distri/core";
import { workflowService, datasetService, recordService, knowledgeSourceService } from "@/services/service-registry";
import type { ToolHandler } from "../../types";
import type { TopicHierarchyNode } from "@/types/dataset-types";
import { countLeafTopics } from "../helpers";
import type { ProposedTopic } from "../propose-plan/types";
import { normalizeTopicSegments, normalizeObjectiveToRole } from "../shared/topic-system-prompt";

import { generateTopicsViaBackend } from "./backend";
import { generateTopicsViaFrontend } from "./frontend";

/** Convert TopicHierarchyNode[] to ProposedTopic[], preserving sourceChunkRefs */
function hierarchyToProposedTopics(nodes: TopicHierarchyNode[]): ProposedTopic[] {
  return nodes.map(node => {
    const topic: ProposedTopic = {
      name: node.name,
      description: node.description || '',
      target_count: 0,
      source_chunk_refs: node.sourceChunkRefs,
    };
    if (node.children && node.children.length > 0) {
      topic.subtopics = hierarchyToProposedTopics(node.children);
    }
    return topic;
  });
}

/**
 * Extract topics from all knowledge sources for a dataset
 * Returns a flat list of unique topic strings
 */
async function getKnowledgeSourceTopics(workflowId: string): Promise<string[]> {
  try {
    const sources = await knowledgeSourceService.list(workflowId);
    const allTopics: string[] = [];

    for (const source of sources) {
      const titles = source.parts
        .filter(p => p.type === "text")
        .map(p => p.title)
        .filter((t): t is string => Boolean(t));
      allTopics.push(...titles);
    }

    // Deduplicate and return
    return [...new Set(allTopics)];
  } catch (error) {
    console.warn("[suggest_topics] Failed to get knowledge source topics:", error);
    return [];
  }
}

// Feature flag: Set to true to use the backend topic hierarchy generation endpoint
// Set to false to use the existing frontend LLM-based generation
const USE_BACKEND_TOPIC_GENERATION = false;

// =============================================================================
// Shared parameter parsing
// =============================================================================

function parseNumericParam(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value, 10) || fallback;
  return fallback;
}

// =============================================================================
// Core topic generation (no side effects)
// =============================================================================

// =============================================================================
// Explicit topics → hierarchy conversion (no LLM)
// =============================================================================

let explicitNodeCounter = 0;

/** Convert flat topic names into TopicHierarchyNode[] */
function topicNamesToHierarchy(names: string[]): TopicHierarchyNode[] {
  explicitNodeCounter = 0;
  return names.map((name) => ({
    id: `topic_${++explicitNodeCounter}`,
    name: name.toLowerCase().replace(/\s+/g, "_"),
  }));
}

/** Merge new topics into existing hierarchy (dedup by normalized name) */
function mergeHierarchies(
  existing: TopicHierarchyNode[],
  additions: TopicHierarchyNode[],
): TopicHierarchyNode[] {
  const existingNames = new Set<string>();
  const collectNames = (nodes: TopicHierarchyNode[]) => {
    for (const n of nodes) {
      existingNames.add(n.name.toLowerCase());
      if (n.children) collectNames(n.children);
    }
  };
  collectNames(existing);

  const newOnly = additions.filter((n) => !existingNames.has(n.name.toLowerCase()));
  return [...existing, ...newOnly];
}

/**
 * Generate topics using the frontend LLM pipeline.
 * Pure function — no DB writes, no workflow state changes.
 * Used by both the suggest_topics tool and plan creation flow.
 */
async function generateTopicsCore(
  workflowId: string,
  trainingGoals: string | undefined,
  depthValue: number,
  degreeValue: number,
  maxTopicsValue: number,
  focusValue?: string,
): Promise<{ success: boolean; hierarchy?: TopicHierarchyNode[]; error?: string }> {
  if (USE_BACKEND_TOPIC_GENERATION) {
    const records = await recordService.getAllRecordsPaginated(workflowId);
    if (records.length === 0) {
      // For suggest mode (plan creation), empty records is fine
      // Fall through to frontend generation
    } else {
      const formattedRecords = records.slice(0, 20).map((r) => ({ data: r.data }));
      const autoTopics = await getKnowledgeSourceTopics(workflowId);

      const result = await generateTopicsViaBackend(
        trainingGoals || "Generate diverse training data",
        depthValue,
        degreeValue,
        formattedRecords,
        maxTopicsValue,
        focusValue,
        autoTopics.length > 0 ? autoTopics : undefined,
      );

      if (result.success && result.hierarchy) {
        return { success: true, hierarchy: result.hierarchy };
      }
      return { success: false, error: result.error || "Failed to generate topics via backend" };
    }
  }

  // Frontend LLM-based topic generation (handles knowledge sources automatically)
  console.log("[suggest_topics] Using frontend generation with automatic knowledge context");

  const result = await generateTopicsViaFrontend(
    workflowId,
    depthValue,
    degreeValue,
    maxTopicsValue,
    trainingGoals,
    focusValue,
  );

  if (!result.success || !result.hierarchy) {
    return { success: false, error: result.error || "Failed to generate topics" };
  }

  return { success: true, hierarchy: result.hierarchy };
}

// =============================================================================
// Handler
// =============================================================================

export const generateTopicsHandler: ToolHandler = async (params) => {
  try {
    const {
      workflow_id,
      method = "auto",
      max_depth = 2,
      degree = 2,
      max_topics = 3,
      focus,
      topics: rawTopics,
      mode = "replace",
    } = params;

    const depthValue = parseNumericParam(max_depth, 2);
    const degreeValue = parseNumericParam(degree, 2);
    const maxTopicsValue = parseNumericParam(max_topics, 3);
    const focusValue = typeof focus === "string" && focus.trim() ? focus.trim() : undefined;

    // Parse explicit topics if provided
    const explicitTopics: string[] | undefined =
      Array.isArray(rawTopics) && rawTopics.length > 0
        ? rawTopics.map(String).filter((t) => t.trim().length > 0)
        : undefined;

    // =========================================================================
    // Suggest mode: workflow_id only, no side effects
    // Used during plan creation to get topic suggestions
    // =========================================================================
    if (workflow_id && typeof workflow_id === "string" && !workflow_id) {
      const dataset = await datasetService.getById(workflow_id);
      if (!dataset) {
        return { success: false, error: `Dataset ${workflow_id} not found` };
      }

      let hierarchy: TopicHierarchyNode[];

      if (explicitTopics) {
        // Explicit topics provided — skip LLM
        console.log("[suggest_topics] Suggest mode with explicit topics:", explicitTopics.length);
        hierarchy = topicNamesToHierarchy(explicitTopics);
      } else {
        // No explicit topics — generate via LLM
        console.log("[suggest_topics] Suggest mode (no DB writes) for dataset:", workflow_id);
        const result = await generateTopicsCore(
          workflow_id,
          dataset.datasetObjective,
          depthValue,
          degreeValue,
          maxTopicsValue,
          focusValue,
        );
        if (!result.success || !result.hierarchy) {
          return { success: false, error: result.error };
        }
        hierarchy = result.hierarchy;
      }

      // Append mode: merge with existing hierarchy from dataset
      if (mode === "append") {
        const existingHierarchy = dataset.topicHierarchy?.hierarchy;
        if (existingHierarchy && existingHierarchy.length > 0) {
          const before = hierarchy.length;
          hierarchy = mergeHierarchies(existingHierarchy, hierarchy);
          console.log("[suggest_topics] Append mode: merged", existingHierarchy.length, "existing +", hierarchy.length - existingHierarchy.length, "new (from", before, "provided)");
        }
      }

      // Ensure the objective has a normalized "You are ..." role sentence
      let suggestNormalized = dataset.normalizedObjective;
      if (dataset.datasetObjective && !suggestNormalized) {
        try {
          suggestNormalized = await normalizeObjectiveToRole(dataset.datasetObjective);
          await datasetService.updateObjective(dataset.id, dataset.datasetObjective, suggestNormalized);
        } catch {
          console.warn("[suggest_topics] Objective normalization failed, will use heuristic fallback");
        }
      }

      // Generate LLM-normalized prompt segments for natural system prompts
      if (dataset.datasetObjective) {
        try {
          hierarchy = await normalizeTopicSegments(hierarchy, dataset.datasetObjective, suggestNormalized);
        } catch {
          console.warn("[suggest_topics] Segment normalization failed, falling back to heuristic");
        }
      }

      return {
        success: true,
        hierarchy,
        proposed_topics: hierarchyToProposedTopics(hierarchy),
        topic_count: countLeafTopics(hierarchy),
        depth: depthValue,
        suggest_only: true,
      };
    }

    // =========================================================================
    // Normal mode: workflow_id required, full DB writes
    // =========================================================================
    if (!workflow_id || typeof workflow_id !== "string") {
      return { success: false, error: "workflow_id or workflow_id is required" };
    }

    const workflow = await workflowService.get(workflow_id);
    if (!workflow) {
      return { success: false, error: "Workflow not found" };
    }
    // NOTE: suggest_topics is a PLANNING-ONLY tool — it does NOT advance the
    // workflow step or switch the UI view. Those happen in apply_topic_hierarchy
    // during plan execution.

    let hierarchy: TopicHierarchyNode[];

    if (explicitTopics) {
      // Explicit topics provided — skip LLM
      console.log("[suggest_topics] Using explicit topics:", explicitTopics.length);
      hierarchy = topicNamesToHierarchy(explicitTopics);
    } else {
      // No explicit topics — generate via LLM
      const result = await generateTopicsCore(
        workflow.workflowId,
        workflow.trainingGoals,
        depthValue,
        degreeValue,
        maxTopicsValue,
        focusValue,
      );
      if (!result.success || !result.hierarchy) {
        return { success: false, error: result.error };
      }
      hierarchy = result.hierarchy;
    }

    // Append mode: merge with existing hierarchy from dataset
    if (mode === "append") {
      const dataset = await datasetService.getById(workflow.workflowId);
      const existingHierarchy = dataset?.topicHierarchy?.hierarchy;
      if (existingHierarchy && existingHierarchy.length > 0) {
        hierarchy = mergeHierarchies(existingHierarchy, hierarchy);
        console.log("[suggest_topics] Append mode: merged with existing hierarchy");
      }
    }

    // Ensure the objective has a normalized "You are ..." role sentence
    if (workflow.trainingGoals) {
      const workflowDataset = await datasetService.getById(workflow.workflowId);
      let normalizedObj = workflowDataset?.normalizedObjective;
      if (!normalizedObj) {
        try {
          normalizedObj = await normalizeObjectiveToRole(workflow.trainingGoals);
          await datasetService.updateObjective(workflow.workflowId, workflow.trainingGoals, normalizedObj);
        } catch {
          console.warn("[suggest_topics] Objective normalization failed, will use heuristic fallback");
        }
      }

      // Generate LLM-normalized prompt segments for natural system prompts
      try {
        hierarchy = await normalizeTopicSegments(hierarchy, workflow.trainingGoals, normalizedObj);
      } catch {
        console.warn("[suggest_topics] Segment normalization failed, falling back to heuristic");
      }
    }

    const topicCount = countLeafTopics(hierarchy);

    // NOTE: suggest_topics is a PLANNING-ONLY tool — it does NOT write to the DB.
    // Topics are persisted later by apply_topic_hierarchy during plan execution.
    // The hierarchy is returned in the result so the agent can include it in the plan.

    // Get record counts for categorization info
    const allRecords = await recordService.getAllRecordsPaginated(workflow.workflowId);
    const uncategorizedCount = allRecords.filter((r) => !r.topic).length;

    return {
      success: true,
      hierarchy,
      proposed_topics: hierarchyToProposedTopics(hierarchy),
      method,
      topic_count: topicCount,
      depth: depthValue,
      total_records: allRecords.length,
      uncategorized_count: uncategorizedCount,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate topics",
    };
  }
};

export const generateTopicsTool: DistriFnTool = {
  name: "suggest_topics",
  description:
    "Auto-generate topic hierarchy from dataset content. If knowledge sources (PDFs, documents) have been uploaded, their extracted topics and document sections will be used to derive the topic hierarchy. Can be called in two modes: (1) with workflow_id for full workflow integration (saves to DB), or (2) with workflow_id only for suggest mode (returns hierarchy without side effects — use this during plan creation).",
  type: "function",
  parameters: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description:
          "The workflow ID. Required. Use for normal workflow mode (saves topics to DB) or suggest mode during plan creation.",
      },
      max_depth: {
        type: "number",
        default: 2,
        description: "Maximum hierarchy depth (1-5 levels)",
      },
      degree: {
        type: "number",
        default: 2,
        description: "Branching factor (children per topic)",
      },
      max_topics: {
        type: "number",
        default: 3,
        description: "Maximum number of root topics",
      },
      focus: {
        type: "string",
        description:
          'Optional user guidance for topic generation. Examples: "focus on error handling scenarios", "organize by difficulty level", "emphasize edge cases", "structure around user journey stages"',
      },
      topics: {
        type: "array",
        items: { type: "string" },
        description:
          'Optional explicit topic names. When provided, skips LLM generation and creates a flat hierarchy from these names. Use when the user specifies exact topics (e.g. "use topics: openings, tactics, endgames").',
      },
      mode: {
        type: "string",
        enum: ["replace", "append"],
        default: "replace",
        description:
          'How to handle topics. "replace" (default): new topics replace everything. "append": new topics are added to the existing hierarchy (deduplicates by name).',
      },
    },
    required: [],
  },
  handler: async (input) =>
    JSON.stringify(
      await generateTopicsHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
