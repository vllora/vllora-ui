/**
 * vLLora Grader Template — Checklist Rubric Pattern
 *
 * Uses a decomposed checklist rubric instead of holistic scoring.
 * Each criterion is a binary yes/no question, giving GRPO a richer gradient signal.
 *
 * Research basis:
 *   - Rubrics as Rewards (arXiv:2507.17746): up to 31% improvement over holistic scoring
 *   - Rethinking Rubric Design (arXiv:2602.05125): 160% reward improvement for Qwen3-4B
 *   - HERO (arXiv:2510.07242): stratified scoring +9-11 points for verifiable tasks
 *
 * Scoring architecture:
 *   - Correctness gate (stratified): correct answers score 0.5-1.0, wrong score 0.0-0.5
 *   - Within each tier: rubric checklist determines quality score
 *   - Conciseness handled via rubric criterion (not additive penalty)
 *
 * Available runtime helper:
 *   __langdb_call_llm_as_judge_obj(config, input) -> result matching output_schema, or { error }
 *
 * Must return: { score: <0-1>, reason: <string> }
 *
 * GRPO-specific design principles:
 *   - Stratified scoring (HERO arXiv:2510.07242): correct tier (0.5-1.0) always
 *     exceeds wrong tier (0.0-0.5). Prevents GRPO from preferring wrong-but-fluent
 *     over partially-correct answers.
 *   - Nonzero floor: wrong-but-attempted = 0.05 (not 0.0). Keeps GRPO gradient
 *     alive (DAPO arXiv:2503.14476).
 *   - Multi-criteria reward hacking risk (MO-GRPO arXiv:2509.22047): GRPO
 *     advantage is biased toward higher-variance reward components. If one rubric
 *     criterion has more variance than others, GRPO will over-optimize it. Ensure
 *     criteria weights reflect their relative importance, not their variance.
 *   - Conciseness is a rubric criterion (semantic, not token count) — DRPO-safe
 *     (arXiv:2510.04474). No additive length penalty (GR3 arXiv:2603.10535).
 */
function evaluate(input) {
    // 1. Extract response and history from input
    var response = "";
    var history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        var lastMessage = input.messages[input.messages.length - 1];
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

    // --- Programmatic Hard Gates (instant fail / cap) ---

    // TODO: Add domain-specific hard constraints here
    // Example: check for required format, forbidden content, minimum structure
    // if (response.includes("CONFIDENTIAL")) {
    //   return { score: 0.02, reason: "Response contains confidential information" };
    // }

    // --- LLM-as-Judge: Checklist Rubric Evaluation ---

    var systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    // TODO: Customize rubric criteria for your domain.
    // Design 7-20 binary criteria. Categorize as Essential/Important/Optional.
    // See reference/grader-writing.md "Checklist Rubric Design" for guidance.
    //
    // Check for rubric failure modes (RRD, arXiv:2602.05125):
    //   1. Coverage gaps — does the rubric miss important quality dimensions?
    //   2. Conflated dimensions — does any criterion blend two separate concerns?
    //   3. Misaligned direction — does any criterion accidentally reward bad behavior?
    //   4. Redundancy — are any criteria correlated >0.7? Merge them.

    var config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator. You assess AI responses using a structured checklist rubric. For each criterion, answer YES (1) or NO (0) based strictly on the evidence in the response."
            },
            {
                role: "user",
                content: (systemMsg ? "System context: " + systemMsg.content + "\n\n" : "") +
                    "Conversation History:\n{{history}}\n\n" +
                    "Model Response to Evaluate:\n{{response}}\n" +
                    (groundTruth ? "\nSource Reference (use to verify factual accuracy):\n{{ground_truth}}\n" : "") +
                    "\nEvaluate using this checklist rubric. For each criterion, score 1 (YES) or 0 (NO).\n\n" +
                    // --- CORRECTNESS CRITERIA (Essential — weight 1.0 each) ---
                    "ESSENTIAL CRITERIA (must be correct for a passing score):\n" +
                    "1. FACTUAL_ACCURACY: Is the primary answer/conclusion factually correct?" +
                    (groundTruth ? " Verify against the Source Reference." : "") + "\n" +
                    "2. ADDRESSES_QUESTION: Does the response directly address the specific question asked (not a tangential topic)?\n" +
                    "3. NO_HALLUCINATION: Is the response free of fabricated facts, invented citations, or unsupported claims?\n\n" +
                    // --- QUALITY CRITERIA (Important — weight 0.7 each) ---
                    "IMPORTANT CRITERIA (significantly affects quality):\n" +
                    "4. COMPLETENESS: Are all key aspects of the question covered (not just a partial answer)?\n" +
                    "5. CLEAR_EXPLANATION: Is the reasoning/explanation clear and easy to follow?\n" +
                    "6. APPROPRIATE_DEPTH: Is the level of detail appropriate (not too shallow, not overly technical for the context)?\n\n" +
                    // --- STYLE CRITERIA (Optional — weight 0.3 each) ---
                    "OPTIONAL CRITERIA (nice-to-have):\n" +
                    "7. WELL_STRUCTURED: Is the response well-organized (logical flow, paragraphs/lists where appropriate)?\n" +
                    "8. APPROPRIATE_TONE: Is the tone appropriate for the context (professional, empathetic, educational, etc.)?\n" +
                    "9. CONCISE: Is the response free of unnecessary padding, repetition, or filler? A concise correct answer is better than a verbose one.\n\n" +
                    "First provide brief reasoning, then score each criterion 1 or 0.\n\n" +
                    "Answer in JSON format:\n" +
                    "{\n" +
                    '  "reasoning": string (brief explanation of key observations),\n' +
                    '  "factual_accuracy": number (0 or 1),\n' +
                    '  "addresses_question": number (0 or 1),\n' +
                    '  "no_hallucination": number (0 or 1),\n' +
                    '  "completeness": number (0 or 1),\n' +
                    '  "clear_explanation": number (0 or 1),\n' +
                    '  "appropriate_depth": number (0 or 1),\n' +
                    '  "well_structured": number (0 or 1),\n' +
                    '  "appropriate_tone": number (0 or 1),\n' +
                    '  "concise": number (0 or 1)\n' +
                    "}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                factual_accuracy: { type: "number", minimum: 0, maximum: 1 },
                addresses_question: { type: "number", minimum: 0, maximum: 1 },
                no_hallucination: { type: "number", minimum: 0, maximum: 1 },
                completeness: { type: "number", minimum: 0, maximum: 1 },
                clear_explanation: { type: "number", minimum: 0, maximum: 1 },
                appropriate_depth: { type: "number", minimum: 0, maximum: 1 },
                well_structured: { type: "number", minimum: 0, maximum: 1 },
                appropriate_tone: { type: "number", minimum: 0, maximum: 1 },
                concise: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["reasoning", "factual_accuracy", "addresses_question", "no_hallucination",
                "completeness", "clear_explanation", "appropriate_depth",
                "well_structured", "appropriate_tone", "concise"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 800
        }
    };

    // Set input fields for template variable resolution
    input.history = history;
    input.response = response;

    try {
        var result = __langdb_call_llm_as_judge_obj(config, input);

        if (result.error) {
            return {
                score: 0,
                reason: "LLM-as-judge error: " + (result.error || "Unknown error")
            };
        }

        // Extract scores safely (binary: 0 or 1)
        var factualAccuracy = typeof result.factual_accuracy === 'number' ? result.factual_accuracy : 0;
        var addressesQuestion = typeof result.addresses_question === 'number' ? result.addresses_question : 0;
        var noHallucination = typeof result.no_hallucination === 'number' ? result.no_hallucination : 0;
        var completeness = typeof result.completeness === 'number' ? result.completeness : 0;
        var clearExplanation = typeof result.clear_explanation === 'number' ? result.clear_explanation : 0;
        var appropriateDepth = typeof result.appropriate_depth === 'number' ? result.appropriate_depth : 0;
        var wellStructured = typeof result.well_structured === 'number' ? result.well_structured : 0;
        var appropriateTone = typeof result.appropriate_tone === 'number' ? result.appropriate_tone : 0;
        var concise = typeof result.concise === 'number' ? result.concise : 0;

        var judgeReasoning = result.reasoning || "No reasoning provided";

        // --- Stratified Scoring (HERO, arXiv:2510.07242) ---
        // Essential criteria determine correctness tier.
        // Quality criteria determine position within that tier.

        // Correctness: all 3 essential criteria must pass for "correct" tier
        var essentialScore = (factualAccuracy + addressesQuestion + noHallucination) / 3.0;
        var isCorrect = essentialScore >= 0.67; // at least 2 of 3 essential criteria pass

        // Quality: weighted sum of important + optional criteria
        // Important (weight 0.7 each): completeness, clear_explanation, appropriate_depth
        // Optional (weight 0.3 each): well_structured, appropriate_tone, concise
        var importantSum = (completeness * 0.7) + (clearExplanation * 0.7) + (appropriateDepth * 0.7);
        var optionalSum = (wellStructured * 0.3) + (appropriateTone * 0.3) + (concise * 0.3);
        var maxWeightedSum = (3 * 0.7) + (3 * 0.3); // 2.1 + 0.9 = 3.0
        var qualityScore = (importantSum + optionalSum) / maxWeightedSum;

        // Stratified final score:
        // Correct answers: 0.50-1.00 (quality determines position)
        // Wrong answers: 0.02-0.50 (quality determines position, floor at 0.02 for GRPO gradient)
        var finalScore;
        if (isCorrect) {
            finalScore = 0.50 + 0.50 * qualityScore;
        } else {
            // Partial credit based on how many essential criteria passed + quality
            var partialEssential = essentialScore * 0.5;
            finalScore = 0.02 + (partialEssential + qualityScore * 0.3) * (0.48 / 0.8);
            finalScore = Math.min(finalScore, 0.49); // cap below correct tier
        }

        if (isNaN(finalScore)) finalScore = 0.02;
        finalScore = Math.max(0.02, Math.min(1.0, finalScore));

        // Build detailed reason with per-criterion breakdown
        var criteriaBreakdown =
            "Essential[" + factualAccuracy + "," + addressesQuestion + "," + noHallucination + "]=" +
            (isCorrect ? "PASS" : "FAIL") +
            " Quality[comp=" + completeness + ",clarity=" + clearExplanation +
            ",depth=" + appropriateDepth + ",struct=" + wellStructured +
            ",tone=" + appropriateTone + ",concise=" + concise + "]=" +
            qualityScore.toFixed(2);

        return {
            score: finalScore,
            reason: criteriaBreakdown + " | " + judgeReasoning,
            factual_accuracy: factualAccuracy,
            addresses_question: addressesQuestion,
            no_hallucination: noHallucination,
            completeness: completeness,
            clear_explanation: clearExplanation,
            appropriate_depth: appropriateDepth,
            well_structured: wellStructured,
            appropriate_tone: appropriateTone,
            concise: concise
        };
    } catch (error) {
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
}
