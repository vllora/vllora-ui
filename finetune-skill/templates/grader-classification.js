/**
 * Classification / Categorization Grader
 *
 * For models that assign labels, categories, or tags from a defined set.
 * Examples: sentiment analysis, intent detection, triage, topic tagging,
 * severity classification, document categorization, allergen detection.
 *
 * Architecture: LLM-based label extraction + fuzzy matching against ground truth
 * + LLM-as-judge for explanation quality.
 *
 * Scoring (4-tier for GRPO gradient):
 *   0.8-1.0 — Correct label + good explanation
 *   0.6-0.7 — Correct label + weak/no explanation
 *   0.2-0.4 — Wrong label but related/adjacent category + reasoning shown
 *   0.0     — Empty response, refusal, or completely wrong category
 *
 * Customize: VALID_LABELS, LABEL_ALIASES, DOMAIN
 *
 * ⚠️ MULTI-LABEL TASKS — PRECISION vs RECALL BALANCE:
 * For multi-label classification (allergen detection, tag assignment, entity extraction),
 * use F-beta scoring to control precision-recall tradeoff:
 *   - F1 (β=1.0): Equal weight to precision and recall. DEFAULT but creates an
 *     over-prediction exploit — GRPO learns to list extra labels because high recall
 *     outscores missing labels in group comparisons (MO-GRPO arXiv:2509.22047 Theorem 1:
 *     GRPO advantage is biased toward higher-variance reward components).
 *   - F0.5 (β=0.5): Precision-heavy. Use when false positives are costly (allergens,
 *     medical labels, compliance). 1 FP costs as much as 2 FN. Prevents over-prediction
 *     exploit.
 *   - F2 (β=2.0): Recall-heavy. Use when false negatives are costly (screening, search).
 *
 * Also add a PRECISION FLOOR for safety-critical multi-label tasks:
 *   if (precision < 0.75) score = Math.min(score, 0.5);
 * This ensures no over-predicting completion can outrank a correct one in GRPO group
 * comparisons (CoRPO arXiv:2511.04439: 18% of failed rollouts receive positive advantage
 * without this guard).
 *
 * Ref: MO-GRPO (arXiv:2509.22047), CoRPO (arXiv:2511.04439)
 *
 * GRPO LENGTH EXPLOITATION: Without conciseness control, GRPO models learn verbose
 * responses. This template includes a SOFT word-count penalty on WRONG/PARTIAL answers
 * and a brevity bonus on CORRECT answers.
 *
 * ⚠️ DRPO ANTI-PATTERN (arXiv:2510.04474): NEVER apply word-count penalties uniformly
 * to correct AND wrong answers. A penalized correct-but-verbose answer can score BELOW
 * wrong answers, inverting its GRPO advantage and teaching the model "verbose + correct
 * is worse than wrong." This template avoids this by:
 *   - Correct answers: NO word-count penalty, only LLM conciseness criterion + brevity bonus
 *   - Wrong/partial answers: soft multiplicative word-count penalty (max 25%)
 *
 * Customize expectedMaxWords based on GT lengths. Set to 0 to disable.
 * Ref: Dr. GRPO (arXiv:2503.20783), DAPO (arXiv:2503.14476), DRPO (arXiv:2510.04474)
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

    if (!response || response.trim().length < 3) {
        return { score: 0, reason: "Response is empty or too short" };
    }

    if (!groundTruth || groundTruth.trim().length === 0) {
        return { score: 0, reason: "No ground truth label provided — cannot evaluate" };
    }

    // ─── Step 1: Normalize ground truth label ───

    var correctLabel = normalizeLabel(groundTruth);

    // ─── Step 2: Extract model's label — regex first, LLM fallback ───

    var modelLabel = extractLabelRegex(response);
    var extractionMethod = "regex";

    if (!modelLabel) {
        modelLabel = extractLabelWithLLM(response, correctLabel, input);
        extractionMethod = "llm";
    }

    if (!modelLabel) {
        if (response.length > 50) {
            return { score: 0.05, reason: "Could not extract a classification label from response (tried regex + LLM)." };
        }
        return { score: 0, reason: "Could not extract any label from response." };
    }

    // ─── Step 3: Check match ───

    var matchResult = checkLabelMatch(modelLabel, correctLabel);

    // ─── Step 4: Assess explanation quality ───

    var explanationScore = assessExplanationQuality(response, history, groundTruth, input);

    // ─── Step 5: Combine into final score ───

    // ─── Conciseness: word count + brevity bonus / penalty ───
    // Customize expectedMaxWords based on your GT lengths (P95 word count + 50% headroom).
    // DRPO (arXiv:2510.04474): NEVER penalize correct answers with word-count — it can
    // invert their GRPO advantage. Instead: brevity bonus for correct+concise, penalty
    // only on wrong/partial. Multiplicative form (GR3 arXiv:2603.10535); additive collapses.
    var expectedMaxWords = 100; // TODO: Set from GT P95 word count + 50% headroom
    var wordCount = response.split(/\s+/).length;

    // Compute penalty factor for wrong/partial answers ONLY
    var wrongPenaltyFactor = 1.0;
    var penaltyNote = "";
    if (expectedMaxWords > 0 && wordCount > expectedMaxWords * 2) {
        wrongPenaltyFactor = 0.75;
        penaltyNote = " Conciseness: severely over expected length (" + wordCount + " words, expected <" + expectedMaxWords + ")";
    } else if (expectedMaxWords > 0 && wordCount > expectedMaxWords) {
        var overRatio = (wordCount - expectedMaxWords) / expectedMaxWords;
        var penalty = Math.min(0.15, overRatio * 0.15);
        wrongPenaltyFactor = 1 - penalty;
        penaltyNote = " Conciseness: over expected length (" + wordCount + " words, -" + Math.round(penalty * 100) + "%)";
    }

    // Compute brevity bonus for correct answers (reward conciseness without punishing verbosity)
    var brevityBonus = 0;
    var brevityNote = "";
    if (expectedMaxWords > 0 && wordCount <= expectedMaxWords * 0.7 && wordCount >= 10) {
        // Correct + concise: small bonus (+0.03 to +0.05) — creates gradient toward brevity
        // without risking score inversion (DRPO arXiv:2510.04474)
        brevityBonus = 0.03 + 0.02 * (1 - wordCount / (expectedMaxWords * 0.7));
        brevityNote = " Brevity bonus: +" + brevityBonus.toFixed(2) + " (concise at " + wordCount + " words)";
    }

    if (matchResult === "exact") {
        // Correct: NO word-count penalty (DRPO safe). LLM conciseness criterion already
        // in explanation quality provides semantic length signal. Add brevity bonus only.
        var finalScore = 0.6 + (explanationScore * 0.4) + brevityBonus;
        finalScore = Math.max(0, Math.min(1.0, finalScore));
        return {
            score: finalScore,
            reason: "Correct label (" + correctLabel + "). Explanation quality: " + explanationScore.toFixed(2) + "/1.0. Extraction: " + extractionMethod + "." + brevityNote,
            model_label: modelLabel,
            correct_label: correctLabel,
            match_type: "exact",
            explanation_score: explanationScore,
            extraction_method: extractionMethod
        };
    }

    if (matchResult === "partial") {
        // Partial match: apply word-count penalty but floor above wrong-tier max (0.2)
        // to prevent partial-vs-wrong score inversion (same DRPO principle)
        var partialBase = 0.3 + (explanationScore * 0.2);
        var partialScore = Math.max(0.21, Math.min(0.5, partialBase) * wrongPenaltyFactor);
        return {
            score: partialScore,
            reason: "Partial match (model: " + modelLabel + ", correct: " + correctLabel + "). Explanation quality: " + explanationScore.toFixed(2) + "/1.0." + penaltyNote,
            model_label: modelLabel,
            correct_label: correctLabel,
            match_type: "partial",
            explanation_score: explanationScore,
            extraction_method: extractionMethod
        };
    }

    // Wrong label: apply word-count penalty (verbose + wrong should be penalized more)
    var wrongScore = explanationScore * 0.2;
    var wrongFinal = Math.min(0.2, wrongScore) * wrongPenaltyFactor;
    return {
        score: wrongFinal,
        reason: "Wrong label (model: " + modelLabel + ", correct: " + correctLabel + "). Explanation quality: " + explanationScore.toFixed(2) + "/1.0." + penaltyNote,
        model_label: modelLabel,
        correct_label: correctLabel,
        match_type: "wrong",
        explanation_score: explanationScore,
        extraction_method: extractionMethod
    };
}

// ─── Helper: Normalize a label string ───

function normalizeLabel(text) {
    return text.trim().toLowerCase()
        .replace(/^(label|category|class|classification|type)\s*[:=]\s*/i, "")
        .replace(/[.,;!?]+$/, "")
        .trim();
}

// ─── Helper: Try regex extraction of label from response ───

function extractLabelRegex(text) {
    if (!text) return null;
    var trimmed = text.trim();

    // "Label: X" or "Category: X" or "Classification: X"
    var m1 = trimmed.match(/(?:label|category|class|classification|type|result|verdict|assessment)\s*[:=]\s*\**(.+?)(?:\**\s*$|\**\s*[.\n])/im);
    if (m1) return normalizeLabel(m1[1]);

    // "The classification is X" / "I would classify this as X"
    var m2 = trimmed.match(/(?:classify|classified|categorize|categorized|label|labeled)\s+(?:this\s+)?(?:as\s+)?\**(.+?)(?:\**\s*[.,\n]|\**\s*$)/im);
    if (m2) return normalizeLabel(m2[1]);

    // "This is X" at start of response (common for simple classification)
    var m3 = trimmed.match(/^(?:this\s+is\s+(?:a\s+)?|the\s+(?:sentiment|category|type|class)\s+is\s+)\**(.+?)(?:\**\s*[.,\n]|\**\s*$)/im);
    if (m3) return normalizeLabel(m3[1]);

    // Markdown bold standalone at start: "**Positive**" or "**High Risk**"
    var m4 = trimmed.match(/^\*\*(.+?)\*\*/m);
    if (m4 && m4[1].split(/\s+/).length <= 4) return normalizeLabel(m4[1]);

    return null;
}

// ─── Helper: LLM-based label extraction (fallback) ───

function extractLabelWithLLM(response, _correctLabel, input) {
    var config = {
        prompt_template: [
            {
                role: "system",
                content: "You are a label extraction assistant. Extract the classification label from a model response. Return ONLY the label."
            },
            {
                role: "user",
                content: "The model was asked to classify/categorize something. Here is the model's response:\n\n{{response}}\n\nWhat label or category did the model assign? Extract the primary classification label. If the model did not assign any clear label, return 'NONE'.\n\nAnswer in JSON format:\n{\"label\": \"<the extracted label or NONE>\"}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                label: { type: "string" }
            },
            required: ["label"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1-mini",
            temperature: 0.0,
            max_tokens: 100
        }
    };

    input.response = response;

    try {
        var result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) return null;

        var label = (result.label || "").trim();
        if (label && label.toUpperCase() !== "NONE") {
            return normalizeLabel(label);
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ─── Helper: Check label match (exact, partial, or wrong) ───

function checkLabelMatch(modelLabel, correctLabel) {
    var ml = modelLabel.toLowerCase().trim();
    var cl = correctLabel.toLowerCase().trim();

    // Exact match
    if (ml === cl) return "exact";

    // One contains the other (e.g., "positive" in "slightly positive")
    if (ml.indexOf(cl) !== -1 || cl.indexOf(ml) !== -1) return "partial";

    // TODO: Add domain-specific aliases here
    // Example for sentiment:
    // var ALIASES = {
    //     "positive": ["pos", "favorable", "good", "bullish"],
    //     "negative": ["neg", "unfavorable", "bad", "bearish"],
    //     "neutral": ["mixed", "balanced", "neither"]
    // };
    // Check if modelLabel matches any alias of correctLabel

    return "wrong";
}

// ─── Helper: LLM-based explanation quality assessment ───

function assessExplanationQuality(response, history, groundTruth, input) {
    var systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    var config = {
        prompt_template: [
            {
                role: "system",
                // TODO: Customize to your domain
                content: "You are an expert evaluator assessing the quality of reasoning behind a classification decision."
            },
            {
                role: "user",
                content: (systemMsg ? "System context: " + systemMsg.content + "\n\n" : "") + "Conversation History:\n{{history}}\n\nModel Response:\n{{response}}\n" + (groundTruth ? "\nCorrect Label: {{ground_truth}}\n" : "") + "\nRate the EXPLANATION QUALITY (not whether the label is correct):\n\n1. EVIDENCE: Does the response cite specific evidence from the input to justify the classification? (0-5)\n2. REASONING: Is the reasoning chain logical and domain-appropriate? (0-5)\n3. CONFIDENCE: Does it acknowledge ambiguity where appropriate, or express appropriate confidence? (0-5)\n\nAnswer in JSON format:\n{\n  \"reasoning\": string,\n  \"evidence\": number (0-5),\n  \"reasoning_quality\": number (0-5),\n  \"confidence\": number (0-5)\n}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                evidence: { type: "number", minimum: 0, maximum: 5 },
                reasoning_quality: { type: "number", minimum: 0, maximum: 5 },
                confidence: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "evidence", "reasoning_quality", "confidence"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 600
        }
    };

    input.history = history;
    input.response = response;

    try {
        var result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) return 0.5;

        var ev = typeof result.evidence === "number" ? result.evidence : 0;
        var rq = typeof result.reasoning_quality === "number" ? result.reasoning_quality : 0;
        var cf = typeof result.confidence === "number" ? result.confidence : 0;

        var weighted = (ev * 0.40) + (rq * 0.40) + (cf * 0.20);
        return Math.max(0, Math.min(1, weighted / 5.0));
    } catch (e) {
        return 0.5;
    }
}
