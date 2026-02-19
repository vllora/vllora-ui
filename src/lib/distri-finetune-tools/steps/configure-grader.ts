/**
 * Configure Grader Tool
 *
 * Configures the evaluation/grader function for RFT.
 * - If `script` is provided, saves it directly.
 * - If `script` is omitted, regenerates from the proposed plan's criteria and objective.
 * - If `feedback` is provided (with or without script), uses LLM to apply modifications.
 */

import type { DistriFnTool } from "@distri/core";
import * as workflowDB from "@/services/finetune-workflow-db";
import * as datasetsDB from "@/services/datasets-db";
import { updateDatasetEvalScript as updateBackendEvalScript } from "@/services/finetune-api";
import { getProposedPlan } from "./proposed-plan-store";
import { generateGraderTemplate } from "./propose-plan/grader-template";
import { proposePlanHandler } from "./propose-plan";
import { callLucy } from "./shared/lucy-client";
import type { ToolHandler } from "../types";

/**
 * Use LLM to apply user feedback to an existing grader script.
 */
async function applyFeedbackToScript(
  baseScript: string,
  feedback: string,
  objective: string,
): Promise<string> {
  const systemPrompt = `You are an expert at writing JavaScript evaluation functions for LLM fine-tuning.
You will be given an existing grader script and user feedback requesting changes.
Your job is to modify the script according to the feedback while preserving the overall structure.

Rules:
- The function must be named \`evaluate\` and accept a single \`input\` parameter
- It must return an object with at least \`score\` (0-1) and \`reason\` (string)
- Keep the LLM-as-judge pattern if present (using \`__langdb_call_llm_as_judge_obj\`)
- Only output the modified JavaScript code, no markdown fences or explanations
- Preserve any programmatic checks (JSON validation, key checks, etc.) unless the feedback explicitly asks to remove them`;

  const userPrompt = `Training objective: ${objective}

Current grader script:
\`\`\`javascript
${baseScript}
\`\`\`

User feedback: ${feedback}

Output ONLY the modified JavaScript code:`;

  const result = await callLucy(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      temperature: 0.1,
      label: "grader_feedback_apply",
    },
  );

  // Strip markdown fences if present
  let cleaned = result.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:javascript|js)?\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}

export const configureGraderHandler: ToolHandler = async (params) => {
  try {
    const {
      workflow_id,
      script: explicitScript,
      feedback,
    } = params;

    if (!workflow_id || typeof workflow_id !== "string") {
      return { success: false, error: "workflow_id is required" };
    }

    const workflow = await workflowDB.getWorkflow(workflow_id);
    if (!workflow) {
      return { success: false, error: "Workflow not found" };
    }

    // Resolve the base script
    let script: string;
    let regenerated = false;
    const hasFeedback = typeof feedback === "string" && feedback.trim().length > 0;

    if (explicitScript && typeof explicitScript === "string") {
      // 1. Explicit script provided → use it directly
      script = explicitScript;
    } else if (hasFeedback) {
      // 2. Feedback provided without script → modify the existing saved script
      const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
      if (!dataset?.evalScript) {
        return {
          success: false,
          error:
            "No existing grader script to modify. Please provide a script or run configure_grader without feedback first to generate one.",
        };
      }
      script = dataset.evalScript;
    } else {
      // 3. Neither script nor feedback → regenerate from plan
      let plan = await getProposedPlan(workflow.datasetId);

      if (!plan?.grader_config?.criteria || !plan.objective) {
        // No plan exists → auto-run propose_plan to generate one
        const proposeResult = await proposePlanHandler({
          dataset_id: workflow.datasetId,
        });
        const result = proposeResult as Record<string, unknown>;
        if (result.success && result.plan) {
          plan = result.plan as typeof plan;
        } else {
          return {
            success: false,
            error:
              result.error as string ||
              "No proposed plan found and auto-generation failed. Please set a training objective and run propose_plan first.",
          };
        }
      }

      script = generateGraderTemplate(
        plan!.grader_config?.criteria ?? [],
        plan!.objective,
        plan!.output_format ?? null,
      );
      regenerated = true;
    }

    // Apply user feedback via LLM if provided
    let feedbackApplied = false;
    if (hasFeedback) {
      const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
      const objective =
        dataset?.datasetObjective || workflow.trainingGoals || "general evaluation";
      script = await applyFeedbackToScript(script, feedback as string, objective);
      feedbackApplied = true;
    }

    // Switch to Evaluator tab so user can see the configured grader
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("finetune-set-view-mode", {
          detail: { section: "evaluator" },
        }),
      );
    }

    // Save eval script to dataset (local IndexedDB)
    await datasetsDB.updateDatasetEvalScript(workflow.datasetId, script);

    // Sync to backend if dataset has been uploaded
    const dataset = await datasetsDB.getDatasetById(workflow.datasetId);
    if (dataset?.backendDatasetId) {
      try {
        await updateBackendEvalScript(dataset.backendDatasetId, script);
      } catch (backendErr) {
        console.error("Failed to sync eval script to backend:", backendErr);
      }
    }

    // Update workflow with metadata only
    await workflowDB.updateStepData(workflow_id, "graderConfig", {
      type: "js",
      configuredAt: Date.now(),
    });

    return {
      success: true,
      grader_type: "js",
      regenerated,
      feedback_applied: feedbackApplied,
      configured_at: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to configure grader",
    };
  }
};

export const configureGraderTool: DistriFnTool = {
  name: "configure_grader",
  description:
    "Configure the JavaScript evaluation script for RFT. If script is provided, saves it directly. If script is omitted, regenerates the grader from the proposed plan's criteria and objective using the LLM-as-judge template. If feedback is provided, uses LLM to apply the user's requested modifications to the script.",
  type: "function",
  parameters: {
    type: "object",
    properties: {
      workflow_id: { type: "string", description: "The workflow ID" },
      script: {
        type: "string",
        description:
          "Optional: JavaScript code defining an evaluate(input) function. If omitted, the grader is auto-regenerated from the proposed plan.",
      },
      feedback: {
        type: "string",
        description:
          "Optional: User feedback describing how to modify the grader (e.g. 'make accuracy scoring stricter', 'add a check for hallucinations'). Applied via LLM on top of the base script.",
      },
    },
    required: ["workflow_id"],
  },
  handler: async (input) =>
    JSON.stringify(
      await configureGraderHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
