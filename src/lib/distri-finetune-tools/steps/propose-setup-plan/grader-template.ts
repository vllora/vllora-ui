/**
 * Grader template generation for LLM-as-judge evaluation
 */

import type { GraderCriterion } from './types';

export function generateGraderTemplate(criteria: GraderCriterion[], objective: string): string {
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. **${c.name}** (${Math.round(c.weight * 100)}%): ${c.description}`)
    .join('\n');

  // Generate snake_case keys for each criterion
  const criteriaKeys = criteria.map(c => c.name.toLowerCase().replace(/\s+/g, '_'));

  const outputSchemaProperties = criteria.map(c => {
    const key = c.name.toLowerCase().replace(/\s+/g, '_');
    return `                ${key}: { type: "number", minimum: 0, maximum: 5 }`;
  }).join(',\n');

  const criteriaScoreExtraction = criteriaKeys.map(key =>
    `        const ${key} = typeof result.${key} === 'number' ? result.${key} : 0;`
  ).join('\n');

  const scoreSum = criteriaKeys.join(' + ');
  const returnMetrics = criteriaKeys.map(key => `            ${key}`).join(',\n');

  return `/**
 * LLM-as-a-judge evaluator for: ${objective}
 *
 * Criteria (each scored 0-5, then normalized to 0-1):
${criteriaList}
 */

function evaluate(input) {
    // 1. Extract response from input
    let response = "";
    let history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) {
            response = lastMessage.content;
        }
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    // 2. Guard clause for empty response
    if (!response || response.trim() === "") {
        return {
            score: 0,
            reason: "Model failed to produce a response (empty output)."
        };
    }

    // 3. Define LLM-as-judge configuration
    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator. Your job is to assess the quality of AI responses for: ${objective}"
            },
            {
                role: "user",
                content: \`Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}

Evaluate the response on these criteria:

${criteriaList}

Provide a DETAILED explanation for your evaluation, then assign scores (0-5) for each criterion.

Answer in JSON format:
{
  "reasoning": string (Full detailed explanation),
${criteria.map(c => `  "${c.name.toLowerCase().replace(/\s+/g, '_')}": number (0-5)`).join(',\n')}
}\`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
${outputSchemaProperties}
            },
            required: ["reasoning", ${criteriaKeys.map(k => `"${k}"`).join(', ')}],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 1000
        }
    };

    // 4. Call LLM-as-judge
    try {
        input.history = history;
        input.response = response;

        const result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return {
                score: 0,
                reason: "LLM-as-judge error: " + (result.error || "Unknown error")
            };
        }

        // Extract scores safely
${criteriaScoreExtraction}

        const judgeReasoning = result.reasoning || "No reasoning provided";

        // Calculate final score (average of all criteria, normalized to 0-1)
        const total = ${scoreSum};
        const avgScore = total / ${criteria.length}.0;
        let finalScore = avgScore / 5.0;

        if (isNaN(finalScore)) finalScore = 0;
        finalScore = Math.max(0, Math.min(1, finalScore));

        return {
            score: finalScore,
            reason: judgeReasoning,
${returnMetrics}
        };
    } catch (error) {
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
}`;
}
