/**
 * Compliance / Rule-Application Grader
 *
 * For models that apply multiple rules simultaneously (FDA compliance,
 * tax deductions, legal clause analysis, medical coding).
 * Scores on: rule recall, false positives, citation accuracy, explanation.
 *
 * Customize: TARGET_WORDS, ALPHA, CORRECT_THRESHOLD (length control)
 *
 * ⚠️ GRPO OVER-CITATION EXPLOIT (MO-GRPO arXiv:2509.22047):
 * Compliance tasks are vulnerable to the same over-prediction exploit as
 * multi-label classification. The model may learn to cite MORE rules than
 * necessary because high recall outscores missing rules in GRPO group
 * comparisons. If your task checks rule recall, add a false-citation
 * penalty: penalize citing rules that don't apply to the scenario.
 * For multi-rule tasks, consider using grader-multilabel.js instead.
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
 *      GR3 (arXiv:2603.10535), GRPO-LEAD (arXiv:2504.09696), MO-GRPO (arXiv:2509.22047)
 */
function evaluate(input) {
    // ─── Customize these for your task ───
    // TARGET_WORDS: Set to ground-truth P95 word count. The readiness gate reports
    // this after first eval. If unknown, use 250 as a conservative default for
    // compliance tasks. GT P95 is the safest fixed target when group-relative
    // statistics are unavailable (GRPO-LEAD arXiv:2504.09696, §3.1).
    var TARGET_WORDS = 250;
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

    // ─── LLM-as-Judge: Rule Application Quality ───

    const systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing how well a model applies regulatory/legal/compliance rules to a given scenario."
            },
            {
                role: "user",
                content: `${systemMsg ? "System context: " + systemMsg.content + "\n\n" : ""}Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Source Reference (authoritative rules/guidelines):
{{ground_truth}}
` : "") + `
Rate the response on these criteria (0-5 scale):
1. RULE_RECALL: Did the model identify ALL applicable rules/violations/deductions? (5=found everything, 0=missed most)
2. FALSE_POSITIVES: Did the model cite rules that don't actually apply? (5=no false positives, 0=many wrong rules)
3. CITATION_ACCURACY: Are rule references (section numbers, publication names) correct? (5=all correct, 0=fabricated citations)
4. EXPLANATION: Does the model explain WHY each rule applies in plain language? (5=clear reasoning, 0=just lists rules)
5. COMPLETENESS: Does it cover interactions between rules (e.g., one rule affects another)? (5=considers interactions, 0=treats rules in isolation)
6. CONCISENESS: Does the response apply rules without unnecessary padding, repetition, or filler? A concise correct analysis should score higher than a verbose one. (5=tight and focused, 0=bloated with repetition/filler)

Answer in JSON format:
{
  "reasoning": string,
  "rule_recall": number (0-5),
  "false_positives": number (0-5, higher=better),
  "citation_accuracy": number (0-5),
  "explanation": number (0-5),
  "completeness": number (0-5),
  "conciseness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                rule_recall: { type: "number", minimum: 0, maximum: 5 },
                false_positives: { type: "number", minimum: 0, maximum: 5 },
                citation_accuracy: { type: "number", minimum: 0, maximum: 5 },
                explanation: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 },
                conciseness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "rule_recall", "false_positives", "citation_accuracy", "explanation", "completeness", "conciseness"],
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

        const rr = typeof result.rule_recall === 'number' ? result.rule_recall : 0;
        const fp = typeof result.false_positives === 'number' ? result.false_positives : 0;
        const ca = typeof result.citation_accuracy === 'number' ? result.citation_accuracy : 0;
        const ex = typeof result.explanation === 'number' ? result.explanation : 0;
        const comp = typeof result.completeness === 'number' ? result.completeness : 0;
        const con = typeof result.conciseness === 'number' ? result.conciseness : 0;

        // Weight: recall and false positives matter most for compliance.
        // Conciseness at 10% — consistent with OpenAI RFT Cookbook practice (10-15%).
        // The LLM criterion provides semantic signal; the programmatic GR3 penalty
        // below provides the hard gradient. Raising LLM weight beyond 10% adds noise
        // without improving signal quality (OpenAI RFT Cookbook: "start small, adjust").
        const weighted = (rr * 0.27) + (fp * 0.22) + (ca * 0.18) + (ex * 0.13) + (comp * 0.10) + (con * 0.10);

        // Floor at 0.05 to keep GRPO gradient nonzero (NEVER return 0.0 for attempted answers).
        // Only empty/refusal/error should return 0.0.
        let baseScore = Math.max(0.05, Math.min(1, weighted / 5.0));
        if (isNaN(baseScore)) baseScore = 0.05;

        // ─── GR3-style multiplicative length penalty (arXiv:2603.10535, Eq. 6) ───
        // Formula: R_hat = R * 1 / (1 + α * ℓ_i / ℓ_bar)
        // where ℓ_i = actual words, ℓ_bar = TARGET_WORDS, α = penalty strength.
        //
        // Why multiplicative, not additive: GR3 Prop 3.1 proves additive shaping
        // R + λ*S collapses for ANY λ — length gradient dominates advantage.
        // Multiplicative form (Prop 3.2) gates length signal by task reward:
        // contribution scales as R*(S - μ_S), so low-reward responses suppress
        // the length signal automatically.
        //
        // Binary correctness gate (DRPO arXiv:2510.04474, §3; GRPO-LEAD
        // arXiv:2504.09696, §3.1): All papers gate length penalty on correctness.
        // Correct answers get a small brevity bonus instead. This prevents the
        // DRPO anti-pattern where penalized correct answers drop below the group
        // mean and receive negative advantage.
        //
        // Note: DAPO overlong punishment (arXiv:2503.14476, Eq. 13) is a
        // training-algorithm-level signal, NOT a grader-side penalty. Do not
        // conflate the two — grader penalties are conflated with correctness
        // before group normalization, which is why the DRPO gate matters here.
        var actualWords = Math.max(1, response.split(/\s+/).length);
        var isCorrect = baseScore >= CORRECT_THRESHOLD;

        var finalScore;
        if (isCorrect) {
            // Correct answers: small brevity bonus, no penalty.
            // Keeps GRPO advantage positive for correct-but-verbose answers.
            var brevityBonus = actualWords <= TARGET_WORDS ? 0.02 : 0.0;
            finalScore = Math.min(1.0, baseScore + brevityBonus);
        } else {
            // Wrong/partial: GR3 multiplicative penalty.
            // At 2× target with α=0.5: factor = 1/(1+0.5*2) = 0.50 (halved).
            // At 1× target: factor = 1/(1+0.5*1) = 0.67 (mild).
            // At 0.5× target: factor = 1/(1+0.5*0.5) = 0.80 (minimal).
            var lengthRatio = actualWords / TARGET_WORDS;
            var scaleFactor = 1.0 / (1.0 + ALPHA * lengthRatio);
            finalScore = Math.max(0.05, baseScore * scaleFactor);
        }
        if (isNaN(finalScore)) finalScore = 0.05;

        return {
            score: finalScore,
            reason: result.reasoning || "No reasoning",
            rule_recall: rr, false_positives: fp, citation_accuracy: ca,
            explanation: ex, completeness: comp, conciseness: con,
            length_words: actualWords, length_penalized: !isCorrect
        };
    } catch (error) {
        return { score: 0, reason: "Error: " + (error.message || "Unknown") };
    }
}
