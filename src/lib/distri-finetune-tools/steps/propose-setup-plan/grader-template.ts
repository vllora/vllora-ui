/**
 * Grader template generation for LLM-as-judge evaluation
 */

import type { GraderCriterion, OutputFormat } from './types';

/** Escape a string for safe embedding inside a JS double-quoted string literal */
function escapeForJSString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/** Convert a criterion name to a valid JS identifier (snake_case, alphanumeric + underscore only) */
function toSafeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // strip non-alphanumeric (removes /, -, etc.)
    .replace(/\s+/g, '_')          // spaces to underscores
    .replace(/_+/g, '_')           // collapse multiple underscores
    .replace(/^_|_$/g, '');        // trim leading/trailing underscores
}

export function generateGraderTemplate(
  criteria: GraderCriterion[],
  objective: string,
  outputFormat?: OutputFormat | null,
): string {
  if (outputFormat) {
    return generateStructuredOutputGraderTemplate(criteria, objective, outputFormat);
  }
  return generateConversationalGraderTemplate(criteria, objective);
}

function generateConversationalGraderTemplate(criteria: GraderCriterion[], objective: string): string {
  // Simple numbered list without weights
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. **${c.name}**: ${c.description}`)
    .join('\n');

  // Generate snake_case keys for each criterion
  const criteriaKeys = criteria.map(c => toSafeKey(c.name));

  const outputSchemaProperties = criteria.map(c => {
    const key = toSafeKey(c.name);
    return `                ${key}: { type: "number", minimum: 0, maximum: 5 }`;
  }).join(',\n');

  const criteriaScoreExtraction = criteriaKeys.map(key =>
    `        const ${key} = typeof result.${key} === 'number' ? result.${key} : 0;`
  ).join('\n');

  // Simple sum for average calculation
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
                content: "You are an expert evaluator. Your job is to assess the quality of AI responses for: ${escapeForJSString(objective)}"
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
${criteria.map(c => `  "${toSafeKey(c.name)}": number (0-5)`).join(',\n')}
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

        // Calculate average score across all criteria (each is 0-5)
        const total = ${scoreSum};
        const avgScore = total / ${criteria.length};
        // Normalize to 0-1 (divide by 5 since max score per criterion is 5)
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

function generateStructuredOutputGraderTemplate(
  criteria: GraderCriterion[],
  objective: string,
  outputFormat: OutputFormat,
): string {
  const schemaStr = JSON.stringify(outputFormat.schema, null, 2);
  const schemaKeys = outputFormat.schema.properties
    ? Object.keys(outputFormat.schema.properties as Record<string, unknown>)
    : [];
  const schemaKeysStr = JSON.stringify(schemaKeys);

  // Build criteria list for the LLM judge
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. **${c.name}**: ${c.description}`)
    .join('\n');

  const criteriaKeys = criteria.map(c => toSafeKey(c.name));

  const outputSchemaProperties = criteria.map(c => {
    const key = toSafeKey(c.name);
    return `                ${key}: { type: "number", minimum: 0, maximum: 5 }`;
  }).join(',\n');

  const criteriaScoreExtraction = criteriaKeys.map(key =>
    `        const ${key} = typeof result.${key} === 'number' ? result.${key} : 0;`
  ).join('\n');

  const scoreSum = criteriaKeys.join(' + ');
  const returnMetrics = criteriaKeys.map(key => `            ${key}`).join(',\n');

  return `/**
 * Structured output LLM-as-a-judge evaluator for: ${objective}
 *
 * Validates JSON structure against expected schema, then uses LLM judge
 * for field accuracy evaluation.
 *
 * Expected output schema:
 * ${schemaStr.split('\n').join('\n * ')}
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

    // 3. Programmatic JSON validation
    var parsedResponse;
    try {
        parsedResponse = JSON.parse(response);
    } catch (e) {
        return {
            score: 0,
            reason: "Response is not valid JSON: " + (e.message || "parse error")
        };
    }

    // 4. Schema key check - penalize missing keys
    var expectedKeys = ${schemaKeysStr};
    var responseKeys = Object.keys(parsedResponse);
    var missingKeys = [];
    for (var i = 0; i < expectedKeys.length; i++) {
        if (responseKeys.indexOf(expectedKeys[i]) === -1) {
            missingKeys.push(expectedKeys[i]);
        }
    }
    var keyPenalty = missingKeys.length > 0 ? 0.3 * (missingKeys.length / expectedKeys.length) : 0;
    var keyCheckNote = missingKeys.length > 0
        ? "Missing keys: " + missingKeys.join(", ") + " (penalty: " + keyPenalty.toFixed(2) + ")"
        : "All expected keys present";

    // 5. LLM-as-judge for field accuracy
    var config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator for structured extraction tasks. Your job is to assess the quality and accuracy of extracted JSON data for: ${escapeForJSString(objective)}"
            },
            {
                role: "user",
                content: \`Source Document (from conversation):
{{history}}

Model's Extracted JSON:
{{response}}

Expected Output Schema:
${schemaStr.split('\n').join('\n')}

Evaluate the extraction on these criteria:

${criteriaList}

Consider:
- Are the extracted values accurate based on the source document?
- Are data types correct (numbers vs strings)?
- Are arrays properly populated?
- Are there hallucinated values not present in the source?

Provide a DETAILED explanation for your evaluation, then assign scores (0-5) for each criterion.

Answer in JSON format:
{
  "reasoning": string (Full detailed explanation),
${criteria.map(c => `  "${toSafeKey(c.name)}": number (0-5)`).join(',\n')}
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

    // 6. Call LLM-as-judge
    try {
        input.history = history;
        input.response = response;

        var result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return {
                score: 0,
                reason: "LLM-as-judge error: " + (result.error || "Unknown error")
            };
        }

        // Extract scores safely
${criteriaScoreExtraction}

        var judgeReasoning = result.reasoning || "No reasoning provided";

        // Calculate average score across all criteria (each is 0-5)
        var total = ${scoreSum};
        var avgScore = total / ${criteria.length};
        // Normalize to 0-1 (divide by 5 since max score per criterion is 5)
        var finalScore = avgScore / 5.0;

        // Apply key penalty
        finalScore = finalScore * (1 - keyPenalty);

        if (isNaN(finalScore)) finalScore = 0;
        finalScore = Math.max(0, Math.min(1, finalScore));

        return {
            score: finalScore,
            reason: keyCheckNote + " | " + judgeReasoning,
            json_valid: true,
            missing_keys: missingKeys.length,
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
