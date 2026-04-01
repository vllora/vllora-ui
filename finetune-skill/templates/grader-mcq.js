/**
 * MCQ / Short-Answer QA Grader
 *
 * For models answering multiple-choice or short-answer questions with a
 * verifiable correct answer in ground_truth.
 *
 * Architecture: LLM-based answer extraction + programmatic correctness check
 * + LLM-as-judge for reasoning quality.
 *
 * NEVER returns 0.0 for a parsing failure — uses LLM extraction as fallback
 * when regex can't find the answer. 0.0 is reserved for genuinely wrong or
 * empty responses.
 *
 * Scoring (4-tier for GRPO gradient):
 *   0.9-1.0 — Correct answer + strong reasoning
 *   0.6-0.8 — Correct answer + weak/no reasoning
 *   0.1-0.4 — Wrong answer but shows domain reasoning (partial credit)
 *   0.0     — Empty response, refusal, or no ground truth
 *
 * Customize: ANSWER_CHOICES, DOMAIN, REASONING_CRITERIA
 */
function evaluate(input) {
    // ─── Extract response and context ───

    var response = "";
    var history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        var lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string") ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    // ─── Guard clauses ───

    if (!response || response.trim().length < 5) {
        return { score: 0, reason: "Response is empty or too short" };
    }

    if (!groundTruth || groundTruth.trim().length === 0) {
        return { score: 0, reason: "No ground truth provided — cannot evaluate" };
    }

    // ─── Step 1: Extract correct answer from ground truth ───
    // Ground truth is structured (we control the format), so regex is reliable here.

    var correctAnswer = extractAnswerLetter(groundTruth);
    if (!correctAnswer) {
        return { score: 0, reason: "Could not parse answer from ground truth: " + groundTruth.substring(0, 80) };
    }

    // ─── Step 2: Extract model's answer — regex first, LLM fallback ───
    // This is the key design: NEVER return 0 just because regex can't parse.
    // Models respond in wildly different formats. Use LLM extraction as fallback.

    var modelAnswer = extractAnswerRegex(response);
    var extractionMethod = "regex";

    if (!modelAnswer) {
        // Regex failed — use LLM to extract the answer letter
        modelAnswer = extractAnswerWithLLM(response, input);
        extractionMethod = "llm";
    }

    if (!modelAnswer) {
        // Both regex and LLM failed — likely a refusal or off-topic response.
        // Give minimal partial credit if response has domain content.
        if (response.length > 100) {
            return { score: 0.05, reason: "Could not extract any answer choice from response (tried regex + LLM). Response may be off-topic or a refusal." };
        }
        return { score: 0, reason: "Could not extract answer from response and response is very short." };
    }

    // ─── Step 3: Check correctness ───

    var isCorrect = (modelAnswer.toUpperCase() === correctAnswer.toUpperCase());

    // ─── Step 4: Assess reasoning quality via LLM judge ───

    var reasoningScore = assessReasoningQuality(response, history, groundTruth, input);

    // ─── Step 5: Combine into final score ───

    if (isCorrect) {
        // Correct: 0.6 base + up to 0.4 from reasoning quality
        var finalScore = 0.6 + (reasoningScore * 0.4);
        return {
            score: Math.min(1.0, finalScore),
            reason: "Correct (" + correctAnswer + "). Reasoning quality: " + reasoningScore.toFixed(2) + "/1.0. Extraction: " + extractionMethod + ".",
            model_answer: modelAnswer,
            correct_answer: correctAnswer,
            reasoning_score: reasoningScore,
            extraction_method: extractionMethod
        };
    }

    // Wrong answer: up to 0.4 from reasoning quality (partial credit for GRPO signal)
    var partialScore = reasoningScore * 0.4;
    return {
        score: Math.min(0.4, partialScore),
        reason: "Incorrect (model: " + modelAnswer + ", correct: " + correctAnswer + "). Reasoning quality: " + reasoningScore.toFixed(2) + "/1.0. Extraction: " + extractionMethod + ".",
        model_answer: modelAnswer,
        correct_answer: correctAnswer,
        reasoning_score: reasoningScore,
        extraction_method: extractionMethod
    };
}

// ─── Helper: Extract answer letter from ground truth (structured) ───

function extractAnswerLetter(text) {
    if (!text) return null;
    var trimmed = text.trim();

    // "Answer: B" or "answer = B"
    var m1 = trimmed.match(/[Aa]nswer\s*[:=]\s*([A-Za-z])\b/);
    if (m1) return m1[1].toUpperCase();

    // "B." or "B)" at start of line
    var m2 = trimmed.match(/^([A-Ea-e])\s*[.):\-]/m);
    if (m2) return m2[1].toUpperCase();

    // Standalone letter
    var m3 = trimmed.match(/^([A-Ea-e])$/m);
    if (m3) return m3[1].toUpperCase();

    // "(B)" parenthesized
    var m4 = trimmed.match(/\(([A-Ea-e])\)/);
    if (m4) return m4[1].toUpperCase();

    return null;
}

// ─── Helper: Try regex extraction from model response ───

function extractAnswerRegex(text) {
    if (!text) return null;
    var trimmed = text.trim();

    var patterns = [
        /[Aa]nswer\s*[:=]\s*\**([A-Ea-e])\b/,
        /(?:the\s+)?(?:correct|best|most\s+appropriate)?\s*answer\s+is\s+\**([A-Ea-e])\b/i,
        /(?:would|should)\s+(?:be|choose|select|recommend)\s+\**([A-Ea-e])\b/i,
        /(?:option|choice)\s+\**([A-Ea-e])\b/i,
        /\*\*([A-Ea-e])\*\*/,
        /^([A-Ea-e])\s*[.):\-]/m
    ];

    for (var i = 0; i < patterns.length; i++) {
        var m = trimmed.match(patterns[i]);
        if (m) return m[1].toUpperCase();
    }

    return null;
}

// ─── Helper: LLM-based answer extraction (fallback) ───
// This is the critical fallback. When the model writes "Based on the clinical
// presentation and guidelines, the most appropriate management would be to
// initiate oral corticosteroids..." — regex can't find "A" but an LLM can.

function extractAnswerWithLLM(response, input) {
    var config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an answer extraction assistant. Extract the selected answer choice from a model response to a multiple-choice question. Return ONLY the letter."
            },
            {
                role: "user",
                content: "The model was asked a multiple-choice question with options A through E. Here is the model's response:\n\n{{response}}\n\nWhat answer choice did the model select? If the model clearly chose an answer (even if explained in prose), return that letter. If the model did not select any answer, return 'NONE'.\n\nAnswer in JSON format:\n{\"answer\": \"<single letter A-E or NONE>\"}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                answer: { type: "string" }
            },
            required: ["answer"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1-mini",
            temperature: 0.0,
            max_tokens: 50
        }
    };

    input.response = response;

    try {
        var result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) return null;

        var answer = (result.answer || "").trim().toUpperCase();
        if (answer.length === 1 && answer >= "A" && answer <= "E") {
            return answer;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ─── Helper: LLM-based reasoning quality assessment ───

function assessReasoningQuality(response, history, groundTruth, input) {
    var systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    var config = {
        prompt_template: [
            {
                role: "system",
                // TODO: Customize this to your domain (e.g., "clinical reasoning expert",
                // "legal analysis expert", "scientific reasoning expert")
                content: "You are an expert evaluator assessing the quality of reasoning in a response to a multiple-choice question."
            },
            {
                role: "user",
                content: (systemMsg ? "System context: " + systemMsg.content + "\n\n" : "") + "Conversation History:\n{{history}}\n\nModel Response:\n{{response}}\n" + (groundTruth ? "\nCorrect Answer & Explanation:\n{{ground_truth}}\n" : "") + "\nRate the REASONING QUALITY (not whether the answer is correct — that's checked separately):\n\n1. EXPLANATION_DEPTH: Does the response explain WHY the answer is correct with domain-specific reasoning? (0-5)\n2. DISTRACTOR_ANALYSIS: Does it explain why incorrect options are wrong? (0-5)\n3. KNOWLEDGE_APPLICATION: Does it correctly apply domain knowledge/guidelines/principles? (0-5)\n\nAnswer in JSON format:\n{\n  \"reasoning\": string,\n  \"explanation_depth\": number (0-5),\n  \"distractor_analysis\": number (0-5),\n  \"knowledge_application\": number (0-5)\n}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                explanation_depth: { type: "number", minimum: 0, maximum: 5 },
                distractor_analysis: { type: "number", minimum: 0, maximum: 5 },
                knowledge_application: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "explanation_depth", "distractor_analysis", "knowledge_application"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 800
        }
    };

    input.history = history;
    input.response = response;

    try {
        var result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) return 0.5; // Default to mid-range if judge fails

        var ed = typeof result.explanation_depth === "number" ? result.explanation_depth : 0;
        var da = typeof result.distractor_analysis === "number" ? result.distractor_analysis : 0;
        var ka = typeof result.knowledge_application === "number" ? result.knowledge_application : 0;

        // Weighted average, normalized to 0-1
        var weighted = (ed * 0.40) + (da * 0.25) + (ka * 0.35);
        return Math.max(0, Math.min(1, weighted / 5.0));
    } catch (e) {
        return 0.5; // Default mid-range on error
    }
}
