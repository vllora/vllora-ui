/**
 * vLLora Grader Template
 *
 * This evaluation function scores model responses on quality criteria.
 * Customize the criteria to match your training objective.
 *
 * Available runtime helper:
 *   __langdb_call_llm_as_judge_obj(config, input) → result matching output_schema, or { error }
 *
 * Must return: { score: <0-1>, reason: <string> }
 */
function evaluate(input) {
    // 1. Extract response and history from input
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

    // 2. Extract ground truth reference if available
    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string") ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    // 3. Guard clause for empty response
    if (!response || response.trim().length < 10) {
        return {
            score: 0,
            reason: "Response is empty or too short"
        };
    }

    // ─── Programmatic Checks (instant fail / bonus) ───

    // TODO: Add domain-specific hard constraints here
    // Example: check for required format, forbidden content, minimum structure
    // if (response.includes("CONFIDENTIAL")) {
    //   return { score: 0, reason: "Response contains confidential information" };
    // }

    // ─── LLM-as-Judge Evaluation ───

    const systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing AI assistant response quality."
            },
            {
                role: "user",
                content: `${systemMsg ? "System context: " + systemMsg.content + "\n\n" : ""}Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Source Reference (use to verify factual accuracy):
{{ground_truth}}
` : "") + `
Rate the response on these criteria (0-5 scale):
1. ACCURACY: Is the information correct and relevant?
2. HELPFULNESS: Does it address the user's needs?
3. CLARITY: Is it well-structured and easy to understand?
4. COMPLETENESS: Are all aspects of the question covered?
5. TONE: Is the tone appropriate for the context?
` + (groundTruth ? `
When a Source Reference is provided, use it to verify the model's response is factually accurate and covers the correct information. The model does not need to quote the source verbatim.
` : "") + `
Provide a DETAILED explanation for your evaluation, then assign scores (0-5) for each criterion.

Answer in JSON format:
{
  "reasoning": string (Full detailed explanation),
  "accuracy": number (0-5),
  "helpfulness": number (0-5),
  "clarity": number (0-5),
  "completeness": number (0-5),
  "tone": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                accuracy: { type: "number", minimum: 0, maximum: 5 },
                helpfulness: { type: "number", minimum: 0, maximum: 5 },
                clarity: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 },
                tone: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "accuracy", "helpfulness", "clarity", "completeness", "tone"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 1000
        }
    };

    // Set input fields for template variable resolution
    input.history = history;
    input.response = response;

    try {
        const result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return {
                score: 0,
                reason: "LLM-as-judge error: " + (result.error || "Unknown error")
            };
        }

        // Extract scores safely
        const accuracy = typeof result.accuracy === 'number' ? result.accuracy : 0;
        const helpfulness = typeof result.helpfulness === 'number' ? result.helpfulness : 0;
        const clarity = typeof result.clarity === 'number' ? result.clarity : 0;
        const completeness = typeof result.completeness === 'number' ? result.completeness : 0;
        const tone = typeof result.tone === 'number' ? result.tone : 0;

        const judgeReasoning = result.reasoning || "No reasoning provided";

        // Average across criteria (each 0-5), normalize to 0-1
        const total = accuracy + helpfulness + clarity + completeness + tone;
        const avgScore = total / 5;
        let finalScore = avgScore / 5.0;

        if (isNaN(finalScore)) finalScore = 0;
        finalScore = Math.max(0, Math.min(1, finalScore));

        return {
            score: finalScore,
            reason: judgeReasoning,
            accuracy: accuracy,
            helpfulness: helpfulness,
            clarity: clarity,
            completeness: completeness,
            tone: tone
        };
    } catch (error) {
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
}
