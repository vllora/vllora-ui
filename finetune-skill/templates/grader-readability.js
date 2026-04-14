/**
 * Readability + Accuracy Grader
 *
 * For models that simplify complex content (plain language translation,
 * ELI5, contract-to-English, medical-to-patient).
 * Scores on: readability, accuracy preservation, jargon elimination, completeness.
 *
 * Customize: TARGET_GRADE_LEVEL, FORBIDDEN_JARGON, TARGET_WORDS, ALPHA, CORRECT_THRESHOLD
 *
 * GRPO LENGTH EXPLOITATION: Without conciseness control, GRPO models learn verbose
 * responses because longer = more content = higher scores. This template uses TWO
 * length-control mechanisms:
 *   1. LLM-as-judge CONCISENESS criterion (12% weight) — semantic signal
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
 * ⚠️ GRPO REWARD HACKING RISK (MO-GRPO arXiv:2509.22047):
 * Readability graders with multiple criteria (readability + accuracy + completeness)
 * are vulnerable to reward hacking: GRPO may optimize the highest-variance criterion
 * (usually readability/simplicity) at the expense of accuracy. The model learns to
 * simplify aggressively — dropping nuance and facts to maximize readability score.
 * Defense: weight accuracy at least 40% of total score, and ensure the LLM judge
 * penalizes factual omissions even if the text reads well.
 *
 * Ref: Dr. GRPO (arXiv:2503.20783), DAPO (arXiv:2503.14476), DRPO (arXiv:2510.04474),
 *      GR3 (arXiv:2603.10535), GRPO-LEAD (arXiv:2504.09696), MO-GRPO (arXiv:2509.22047)
 */
function evaluate(input) {
    // ─── Customize these for your task ───
    // TARGET_WORDS: Set to ground-truth P95 word count. Readability/simplification
    // tasks typically produce 100-300 word outputs. GT P95 is the safest fixed
    // target (GRPO-LEAD arXiv:2504.09696, §3.1).
    var TARGET_WORDS = 200;
    // ALPHA: GR3 penalty strength (arXiv:2603.10535, Eq. 6). Higher = stricter.
    var ALPHA = 0.5;
    // CORRECT_THRESHOLD: Score above which a response is considered "correct"
    // and exempt from length penalty (DRPO binary gate analogue).
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

    // Flesch-Kincaid approximation (no external deps)
    var words = response.split(/\s+/).filter(function(w) { return w.length > 0; });
    var sentences = response.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; });
    var syllables = 0;
    for (var i = 0; i < words.length; i++) {
        var w = words[i].toLowerCase().replace(/[^a-z]/g, '');
        var count = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
        syllables += (count ? count.length : 1);
    }

    var avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
    var avgSyllablesPerWord = words.length > 0 ? syllables / words.length : 0;
    var fleschKincaid = (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59;
    fleschKincaid = Math.max(0, Math.min(20, fleschKincaid));

    // TODO: Check for forbidden jargon
    // const FORBIDDEN_JARGON = ["indemnification", "hereinafter", "pursuant to", "notwithstanding"];
    // const jargonFound = FORBIDDEN_JARGON.filter(j => response.toLowerCase().includes(j));

    // ─── LLM-as-Judge: Simplification Quality ───

    const systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing how well a model simplifies complex content while preserving accuracy."
            },
            {
                role: "user",
                content: `${systemMsg ? "System context: " + systemMsg.content + "\n\n" : ""}Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Original Source (complex version to simplify from):
{{ground_truth}}
` : "") + `
Computed readability: Flesch-Kincaid grade level ≈ ${fleschKincaid.toFixed(1)}

Rate the response on these criteria (0-5 scale):
1. READABILITY: Is it written in plain, simple language? Would a non-expert understand it? (5=crystal clear, 0=still full of jargon)
2. ACCURACY: Does the simplified version preserve all important meaning from the original? Nothing lost in translation? (5=fully accurate, 0=distorted meaning)
3. JARGON_FREE: Are technical terms replaced with everyday equivalents or explained? (5=no unexplained jargon, 0=still uses technical language)
4. COMPLETENESS: Are all important points from the original covered? Nothing critical omitted? (5=covers everything, 0=missing key points)
5. STRUCTURE: Is it well-organized with clear sections/bullets? Easy to scan? (5=excellent structure, 0=wall of text)
6. CONCISENESS: Does the response answer without unnecessary padding, repetition, or filler? A concise correct answer should score higher than a verbose correct answer. (5=tight and focused, 0=bloated with repetition/filler)

Answer in JSON format:
{
  "reasoning": string,
  "readability": number (0-5),
  "accuracy": number (0-5),
  "jargon_free": number (0-5),
  "completeness": number (0-5),
  "structure": number (0-5),
  "conciseness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                readability: { type: "number", minimum: 0, maximum: 5 },
                accuracy: { type: "number", minimum: 0, maximum: 5 },
                jargon_free: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 },
                structure: { type: "number", minimum: 0, maximum: 5 },
                conciseness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "readability", "accuracy", "jargon_free", "completeness", "structure", "conciseness"],
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

        const rd = typeof result.readability === 'number' ? result.readability : 0;
        const acc = typeof result.accuracy === 'number' ? result.accuracy : 0;
        const jf = typeof result.jargon_free === 'number' ? result.jargon_free : 0;
        const comp = typeof result.completeness === 'number' ? result.completeness : 0;
        const str = typeof result.structure === 'number' ? result.structure : 0;
        const con = typeof result.conciseness === 'number' ? result.conciseness : 0;

        // Weight: readability and accuracy balanced — both matter equally.
        // Conciseness at 12% — consistent with OpenAI RFT Cookbook practice (10-15%).
        // The LLM criterion provides semantic signal; the programmatic GR3 penalty
        // below provides the hard gradient.
        const weighted = (rd * 0.22) + (acc * 0.27) + (jf * 0.18) + (comp * 0.13) + (str * 0.08) + (con * 0.12);

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
            readability: rd, accuracy: acc, jargon_free: jf,
            completeness: comp, structure: str, conciseness: con,
            flesch_kincaid_grade: parseFloat(fleschKincaid.toFixed(1)),
            length_words: actualWords, length_penalized: !isCorrect
        };
    } catch (error) {
        return { score: 0, reason: "Error: " + (error.message || "Unknown") };
    }
}
