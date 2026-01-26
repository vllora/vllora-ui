/**
 * Evaluation Tools for Finetuning Datasets
 * 
 * Generates evaluation prompts (grader prompts) based on dataset content.
 */

import { DistriClient, type DistriMessage } from '@distri/core';

import { getDistriUrl } from '@/config/api';
import { fetchLucyConfig, type LucyConfig } from '@/lib/agent-sync';
import type { Span } from '@/types/common-type';
import * as datasetsDB from '@/services/datasets-db';

// Reuse types from topic-tools where possible or define new ones
interface EvalPromptParams {
    datasetId?: string;
    datasetName?: string;
    recordIds?: string[];
}

interface EvalPromptResult {
    success: boolean;
    error?: string;
    system_prompt?: string;
}

// The template provided by user
const BASE_EVAL_TEMPLATE = `
# Overview
Evaluate the **Model Answer** based on the provided **Source Context** and **Reference Answer**.

**Output Format:**
You must output a single valid JSON object containing exactly these fields:
- \`score\`: A floating point number between 0.0 and 1.0 based on the Grading Criteria.
- \`feedback\`: A concise explanation of why this score was given. Mention specific missing details or hallucinations if any.

Example Output:
{
  "score": 0.75,
  "feedback": "The answer is mostly correct but omits the specific retention period mentioned in the policy."
}

## Grading Criteria
- **1.0 (Perfect)**: Fully accurate, aligned with Reference, no hallucinations.
- **0.75 (Good)**: Mostly correct, minor omissions or slight phrasing issues.
- **0.5 (Partial)**: Partially correct, misses key details, or minor speculation.
- **0.25 (Poor)**: Significantly inaccurate, misses main point, or major hallucinations.
- **0.0 (Failure)**: Completely incorrect, contradicts context, or irrelevant.

## Source Context
"""
{{context_text}}
"""

## Task Data
**Question**: {{question}}
**Reference Answer**: {{reference_answer}}
**Model Answer**: {{model_answer}}
`;

/**
 * generate_evaluation_prompt
 * 
 * Analyzes the dataset to understand the task type, then returns a tailored
 * evaluation prompt (system prompt).
 */
export async function generateEvaluationPrompt(
    params: Record<string, unknown>
): Promise<EvalPromptResult> {
    try {
        const { datasetId: paramDatasetId, datasetName } = params as unknown as EvalPromptParams;

        if (!paramDatasetId && !datasetName) {
            return {
                success: false,
                error: 'Either datasetId or datasetName is required',
            };
        }

        // Resolve Dataset ID
        let targetDatasetId = paramDatasetId;
        if (!targetDatasetId && datasetName) {
            const allDatasets = await datasetsDB.getAllDatasets();
            const match = allDatasets.find(d => d.name.toLowerCase() === datasetName.toLowerCase());
            targetDatasetId = match ? match.id : undefined;
        }

        if (!targetDatasetId) {
            return {
                success: false,
                error: `Dataset not found`,
            };
        }

        // NOTE: In a full implementation, we would analyze the records with LLM 
        // to customize the "Grading Criteria" descriptions specific to the domain.
        // For now, we return the robust standard template which works for most RAG/QA tasks.

        return {
            success: true,
            system_prompt: BASE_EVAL_TEMPLATE.trim()
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate prompt',
        };
    }
}
// Output Schema for Structured Output (if supported) or JSON Mode
const EVAL_OUTPUT_SCHEMA = {
    type: "json_schema",
    json_schema: {
        name: "evaluationresult",
        schema: {
            type: "object",
            properties: {
                score: {
                    type: "number",
                    description: "Score between 0.0 and 1.0 where 1.0 is perfect and 0.0 is failure"
                },
                feedback: {
                    type: "string",
                    description: "Concise explanation of why this score was given"
                }
            },
            required: ["score", "feedback"],
            additionalProperties: false
        },
        strict: true
    }
};

// Cache for Lucy config
let cachedLucyConfig: LucyConfig | null = null;

// Re-implement or wrapper to handle caching if needed
const fetchLucyConfigCached = async (): Promise<LucyConfig> => {
    if (cachedLucyConfig) return cachedLucyConfig;
    cachedLucyConfig = await fetchLucyConfig();
    return cachedLucyConfig;
};

/**
 * Get internal Distri client with latest config
 */
async function getDistriClient(): Promise<DistriClient> {
    const lucyConfig = await fetchLucyConfigCached();
    const rawUrl = lucyConfig.distri_url || getDistriUrl();
    // Ensure we have the /v1 prefix as expected by the Distri server
    const baseUrl = `${rawUrl.replace(/\/$/, '')}/v1`;

    return DistriClient.create({
        baseUrl
    });
}

/**
 * run_evaluation_on_dataset
 * 
 * Runs the evaluation prompt against records in the dataset
 */
export async function runEvaluationOnDataset(
    params: Record<string, unknown>
): Promise<EvalRunResult> {
    try {
        const { datasetId: paramDatasetId, datasetName, systemPrompt, maxRecords = 10 } = params as unknown as EvalRunParams;

        if (!paramDatasetId && !datasetName) {
            return {
                success: false,
                error: 'Either datasetId or datasetName is required',
            };
        }

        // Resolve Dataset ID
        let targetDatasetId = paramDatasetId;
        if (!targetDatasetId && datasetName) {
            const allDatasets = await datasetsDB.getAllDatasets();
            const match = allDatasets.find(d => d.name.toLowerCase() === datasetName.toLowerCase());
            targetDatasetId = match ? match.id : undefined;
        }

        if (!targetDatasetId) {
            return {
                success: false,
                error: `Dataset not found`,
            };
        }

        // Get Records
        const records = await datasetsDB.getRecordsByDatasetId(targetDatasetId);
        if (records.length === 0) {
            return {
                success: false,
                error: 'Dataset is empty',
            };
        }

        const processRecords = records.slice(0, maxRecords);
        let updatedCount = 0;
        let errorCount = 0;
        const results: any[] = [];
        const promptTemplate = systemPrompt || BASE_EVAL_TEMPLATE;

        // Process in batches
        const BATCH_SIZE = 5;
        for (let i = 0; i < processRecords.length; i += BATCH_SIZE) {
            const batch = processRecords.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (record) => {
                try {
                    const span = record.data as Span;
                    const context = JSON.stringify(span.attribute || {});

                    // Simple extraction logic (can be replaced by advanced one)
                    const attr = (span.attribute || {}) as any;
                    const inputRaw = attr.input || attr.request;
                    const outputRaw = attr.output || attr.response || attr.content;

                    const input = typeof inputRaw === 'string' ? inputRaw : JSON.stringify(inputRaw);
                    const output = typeof outputRaw === 'string' ? outputRaw : JSON.stringify(outputRaw);

                    const filledPrompt = promptTemplate
                        .replace('{{context_text}}', context.substring(0, 1000))
                        .replace('{{question}}', input.substring(0, 500))
                        .replace('{{reference_answer}}', 'N/A')
                        .replace('{{model_answer}}', output.substring(0, 500));

                    const messages: DistriMessage[] = [
                        DistriClient.initDistriMessage('system', [
                            { part_type: 'text', data: filledPrompt }
                        ]),
                        DistriClient.initDistriMessage('user', [
                            { part_type: 'text', data: 'Evaluate this interaction based on the criteria.' }
                        ])
                    ];

                    const client = await getDistriClient();
                    const llmResponse = await client.llm(
                        messages,
                        [],
                        {
                            model_settings: {
                                temperature: 0,
                                response_format: EVAL_OUTPUT_SCHEMA
                            }
                        }
                    );

                    let evalResult;
                    const content = llmResponse.content;
                    if (content) {
                        try {
                            evalResult = JSON.parse(content);
                        } catch (e) {
                            console.error('Failed to parse JSON', content);
                        }
                    }

                    if (evalResult && typeof evalResult.score === 'number') {
                        await datasetsDB.updateRecordEvaluation(targetDatasetId!, record.id, evalResult.score);
                        updatedCount++;
                        results.push({ id: record.id, score: evalResult.score });
                    }
                } catch (e) {
                    errorCount++;
                    console.error('Eval record failed', record.id, e);
                }
            }));
        }

        return {
            success: true,
            records_processed: processRecords.length,
            updated_count: updatedCount,
            error_count: errorCount,
            average_score: results.length > 0 ? results.reduce((a, b) => a + b.score, 0) / results.length : 0
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to run evaluation',
        };
    }
}

// Interfaces
interface EvalRunParams {
    datasetId?: string;
    datasetName?: string;
    systemPrompt?: string;
    maxRecords?: number;
}

interface EvalRunResult {
    success: boolean;
    error?: string;
    records_processed?: number;
    updated_count?: number;
    error_count?: number;
    average_score?: number;
}
