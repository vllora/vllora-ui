/**
 * Structured Extraction Grader
 *
 * For models that extract specific data from documents (metrics, fields, entities).
 * Scores on: field accuracy, hallucination rate, completeness, format compliance.
 *
 * Customize: REQUIRED_FIELDS, FORMAT_PATTERN, HALLUCINATION_KEYWORDS, TARGET_WORDS, ALPHA, CORRECT_THRESHOLD
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
 * responses because longer = more content = higher scores. This template uses TWO
 * length-control mechanisms:
 *   1. LLM-as-judge CONCISENESS criterion (10% weight) — semantic signal
 *   2. GR3-style multiplicative length penalty — programmatic, applied only to
 *      wrong/partial answers via a binary correctness gate
 *
 * ⚠️ DRPO ANTI-PATTERN (arXiv:2510.04474, §3): Uniform length penalties invert GRPO
 * advantage — a penalized correct-but-verbose answer can drop below the group mean
 * (which includes zero-reward wrong answers), giving it NEGATIVE advantage. The fix:
 * gate the penalty on correctness. This template penalizes only wrong/partial answers.
 *
 * ⚠️ GR3 ADDITIVE COLLAPSE (arXiv:2603.10535, Prop 3.1): Additive shaping
 * R_hat = R + λ*S collapses for ANY λ — length gradient dominates advantage.
 * MUST use multiplicative form: R * scale_factor (Eq. 6, Prop 3.2).
 *
 * Customize: TARGET_WORDS — set to your ground-truth P95 word count. If unknown,
 * the readiness gate will report eval P95 and GT P95 after first eval run.
 *
 * Ref: Dr. GRPO (arXiv:2503.20783), DAPO (arXiv:2503.14476), DRPO (arXiv:2510.04474),
 *      GR3 (arXiv:2603.10535), GRPO-LEAD (arXiv:2504.09696)
 */
function evaluate(input) {
    // ─── Customize these for your task ───
    // TARGET_WORDS: Set to ground-truth P95 word count. Extraction tasks are
    // typically short (50-150 words). GT P95 is the safest fixed target when
    // group-relative statistics are unavailable (GRPO-LEAD arXiv:2504.09696, §3.1).
    var TARGET_WORDS = 150;
    // ALPHA: GR3 penalty strength (arXiv:2603.10535, Eq. 6). Higher = stricter.
    // 0.5 gives ~33% penalty at 2× target length. 1.0 gives ~50% at 2× target.
    var ALPHA = 0.5;
    // CORRECT_THRESHOLD: Score above which a response is considered "correct"
    // and exempt from length penalty (DRPO binary gate analogue).
    // All papers use binary gates (arXiv:2510.04474, arXiv:2504.09696);
    // 0.60 is the continuous-score analogue for "majority correct".
    var CORRECT_THRESHOLD = 0.60;

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

        // Weight: accuracy and hallucination matter most for extraction.
        // Conciseness at 10% — consistent with OpenAI RFT Cookbook practice (10-15%).
        // The LLM criterion provides semantic signal; the programmatic GR3 penalty
        // below provides the hard gradient.
        const weighted = (fa * 0.30) + (hal * 0.27) + (comp * 0.23) + (fmt * 0.10) + (con * 0.10);

        // Floor at 0.05 to keep GRPO gradient nonzero (NEVER return 0.0 for attempted answers).
        // Only empty/refusal/error should return 0.0.
        let baseScore = Math.max(0.05, Math.min(1, weighted / 5.0));
        if (isNaN(baseScore)) baseScore = 0.05;

        // ─── GR3-style multiplicative length penalty (arXiv:2603.10535, Eq. 6) ───
        // R_hat = R * 1 / (1 + α * ℓ_i / ℓ_bar)
        // Multiplicative form gates length by task reward (Prop 3.2): low-reward
        // responses suppress the length signal automatically.
        // Binary correctness gate (DRPO arXiv:2510.04474, §3): only penalize
        // wrong/partial answers. Correct answers get brevity bonus instead.
        var actualWords = Math.max(1, response.split(/\s+/).length);
        var isCorrect = baseScore >= CORRECT_THRESHOLD;

        var finalScore;
        if (isCorrect) {
            var brevityBonus = actualWords <= TARGET_WORDS ? 0.02 : 0.0;
            finalScore = Math.min(1.0, baseScore + brevityBonus);
        } else {
            var lengthRatio = actualWords / TARGET_WORDS;
            var scaleFactor = 1.0 / (1.0 + ALPHA * lengthRatio);
            finalScore = Math.max(0.05, baseScore * scaleFactor);
        }
        if (isNaN(finalScore)) finalScore = 0.05;

        return {
            score: finalScore,
            reason: result.reasoning || "No reasoning",
            field_accuracy: fa, hallucination: hal, completeness: comp,
            format: fmt, conciseness: con,
            length_words: actualWords, length_penalized: !isCorrect
        };
    } catch (error) {
        return { score: 0, reason: "Error: " + (error.message || "Unknown") };
    }
}
