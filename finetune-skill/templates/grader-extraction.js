/**
 * Structured Extraction Grader
 *
 * For models that extract specific data from documents (metrics, fields, entities).
 * Scores on: field accuracy, hallucination rate, completeness, format compliance.
 *
 * Customize: REQUIRED_FIELDS, FORMAT_PATTERN, HALLUCINATION_KEYWORDS
 *
 * ⚠️ OVER-EXTRACTION / HALLUCINATION DEFENSE:
 * GRPO can learn to over-extract (list extra fields/entities not in the source) because
 * high recall outscores missing fields in group comparisons (MO-GRPO arXiv:2509.22047).
 * For extraction tasks, precision (no hallucinated fields) is typically more important
 * than recall (finding every field). Defenses:
 *   - Use F0.5 scoring (β=0.5) instead of F1 for field-level comparison — weights
 *     precision higher than recall. 1 hallucinated field costs as much as 2 missed fields.
 *   - Add a precision floor: if precision < 0.75, cap score at 0.5. Prevents any
 *     over-extracting completion from outranking a correct one in GRPO groups.
 *   - Add explicit "hallucination penalty" as a separate scoring component — deduct
 *     0.1-0.2 per hallucinated field not found in the source document.
 * Ref: MO-GRPO (arXiv:2509.22047), CoRPO (arXiv:2511.04439)
 *
 * GRPO LENGTH EXPLOITATION: Without conciseness control, GRPO models learn verbose
 * responses because longer = more content = higher scores. This template includes a
 * CONCISENESS criterion in the LLM judge to prevent this. Customize the weight for your task.
 *
 * ⚠️ DRPO ANTI-PATTERN (arXiv:2510.04474): If you add programmatic word-count penalties,
 * NEVER apply them uniformly to correct AND wrong answers. A penalized correct-but-verbose
 * answer can drop below wrong-answer scores, inverting its GRPO advantage. The LLM
 * conciseness criterion used here is safe (semantic, not raw token count).
 *
 * Ref: Dr. GRPO (arXiv:2503.20783), DAPO (arXiv:2503.14476), DRPO (arXiv:2510.04474)
 */
function evaluate(input) {
    let response = "";
    let history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string") ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    if (!response || response.trim().length < 10) {
        return { score: 0, reason: "Response is empty or too short" };
    }

    // ─── Programmatic Checks ───

    // TODO: Define required fields for your extraction task
    // const REQUIRED_FIELDS = ["revenue", "net_income", "total_assets"];
    // let missingFields = REQUIRED_FIELDS.filter(f => !response.toLowerCase().includes(f.toLowerCase()));
    // if (missingFields.length > 0) {
    //     return { score: 0.1, reason: "Missing required fields: " + missingFields.join(", ") };
    // }

    // TODO: Check format compliance (e.g., JSON, table, bullet list)
    // const hasStructuredFormat = response.includes("|") || response.includes("{");
    // if (!hasStructuredFormat) {
    //     // Penalize but don't zero — content might still be correct
    // }

    // ─── LLM-as-Judge: Extraction Quality ───

    const systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing structured data extraction quality."
            },
            {
                role: "user",
                content: `${systemMsg ? "System context: " + systemMsg.content + "\n\n" : ""}Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Source Reference (ground truth data):
{{ground_truth}}
` : "") + `
Rate the extraction on these criteria (0-5 scale):
1. FIELD_ACCURACY: Are extracted values correct? Compare against source reference if available.
2. HALLUCINATION: Does the response contain any numbers, dates, or facts NOT in the source? (5=no hallucination, 0=heavily hallucinated)
3. COMPLETENESS: Were all relevant data points extracted? Nothing important missed?
4. FORMAT: Is the output in the expected structured format? Easy to parse?
5. CONCISENESS: Does the response extract data without unnecessary padding, repetition, or filler? A concise extraction should score higher than one buried in verbose prose. (5=tight and focused, 0=bloated with repetition/filler)

Answer in JSON format:
{
  "reasoning": string,
  "field_accuracy": number (0-5),
  "hallucination": number (0-5, higher=better),
  "completeness": number (0-5),
  "format": number (0-5),
  "conciseness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                field_accuracy: { type: "number", minimum: 0, maximum: 5 },
                hallucination: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 },
                format: { type: "number", minimum: 0, maximum: 5 },
                conciseness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "field_accuracy", "hallucination", "completeness", "format", "conciseness"],
            additionalProperties: false
        },
        completion_params: { model_name: "gpt-4.1", temperature: 0.0, max_tokens: 1000 }
    };

    input.history = history;
    input.response = response;

    try {
        const result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) {
            return { score: 0, reason: "LLM-as-judge error: " + (result.error || "Unknown") };
        }

        const fa = typeof result.field_accuracy === 'number' ? result.field_accuracy : 0;
        const hal = typeof result.hallucination === 'number' ? result.hallucination : 0;
        const comp = typeof result.completeness === 'number' ? result.completeness : 0;
        const fmt = typeof result.format === 'number' ? result.format : 0;
        const con = typeof result.conciseness === 'number' ? result.conciseness : 0;

        // Weight: accuracy and hallucination matter most for extraction
        // Conciseness at 10% weight to prevent GRPO length exploitation (empirical; DRPO arXiv:2510.04474)
        const weighted = (fa * 0.30) + (hal * 0.27) + (comp * 0.23) + (fmt * 0.10) + (con * 0.10);
        let finalScore = Math.max(0, Math.min(1, weighted / 5.0));
        if (isNaN(finalScore)) finalScore = 0;

        return {
            score: finalScore,
            reason: result.reasoning || "No reasoning",
            field_accuracy: fa, hallucination: hal, completeness: comp, format: fmt, conciseness: con
        };
    } catch (error) {
        return { score: 0, reason: "Error: " + (error.message || "Unknown") };
    }
}
