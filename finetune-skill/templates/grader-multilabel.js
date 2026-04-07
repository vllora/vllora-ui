/**
 * Multi-Label Set-Comparison Grader
 *
 * For tasks where the model outputs a SET of labels from a defined vocabulary.
 * Examples: allergen detection, ICD coding, topic tagging, entity extraction,
 * multi-label classification, content moderation flags.
 *
 * Architecture: Regex parsing + LLM extraction fallback → set comparison
 * with configurable F-beta scoring + over-prediction defense.
 *
 * ═══ GRPO-SPECIFIC DESIGN ═══
 *
 * Over-prediction exploit defense (MO-GRPO arXiv:2509.22047 Theorem 1):
 *   GRPO advantage is biased toward higher-variance reward components. In
 *   multi-label tasks, recall has structurally higher variance than precision
 *   (the model can always increase recall by predicting more labels). Without
 *   defense, GRPO learns to over-predict — listing extra labels because high
 *   recall outscores missing labels in group comparisons.
 *
 *   Three-layer defense:
 *   1. F-beta scoring (β configurable, default 0.5 = precision-heavy)
 *   2. Per-FP graduated penalty (0.15 per false positive)
 *   3. Precision floor hard cap (precision < 0.67 → cap score at 0.40)
 *      Ref: CoRPO (arXiv:2511.04439) — without this, ~18% of failed
 *      rollouts receive positive GRPO advantage.
 *
 * Stratified scoring (HERO arXiv:2510.07242):
 *   Correct-tier (0.50-1.0) always exceeds wrong-tier (0.0-0.49).
 *   Guarantees GRPO always prefers partially-correct over wrong-but-fluent.
 *
 * Nonzero floor for attempted answers:
 *   Wrong-but-attempted = 0.05 (not 0.0). Keeps GRPO gradient nonzero
 *   (DAPO arXiv:2503.14476). Only empty/refusal = 0.0.
 *
 * ═══ CRITICAL: NEVER RETURN 0.0 FOR ATTEMPTED ANSWERS ═══
 *
 * Do NOT add "HARD GATE" rules that return score=0.0 for any attempted answer
 * (even wrong ones). When all K=8 completions in a group return 0.0, GRPO has
 * zero within-group variance → zero gradient → no learning. This was diagnosed
 * empirically: a HARD GATE returning 0.0 caused 80% frac_reward_zero_std and
 * flat training. Changing to 0.02 (still very harsh) restored gradient signal
 * and enabled learning.
 *
 * If you want to strongly punish a failure mode:
 *   - Use 0.02 instead of 0.0 (still 50x lower than baseline 1.0)
 *   - Use a precision floor cap at 0.40 (allows some signal)
 *   - Use stratified bands (0.0-0.10 for very wrong, 0.10-0.30 for partial)
 * Only return 0.0 for empty/refusal/no-output cases.
 *
 * Label parsing (xFinder arXiv:2405.11874):
 *   Regex extraction accuracy = 74%. LLM extraction = 93%.
 *   This template uses regex-first + LLM fallback for reliability.
 *
 * ═══ CUSTOMIZATION ═══
 *
 * Required: Set VALID_LABELS array and LABEL_ALIASES map for your task.
 * Optional: Adjust BETA, FP_PENALTY, PRECISION_FLOOR, BREVITY_BONUS_MAX_WORDS.
 *
 * Ref: MO-GRPO (arXiv:2509.22047), CoRPO (arXiv:2511.04439),
 *      HERO (arXiv:2510.07242), xFinder (arXiv:2405.11874),
 *      DRPO (arXiv:2510.04474), DAPO (arXiv:2503.14476)
 */
function evaluate(input) {
    // ═══════════════════════════════════════════════════════
    // CUSTOMIZE THESE FOR YOUR TASK
    // ═══════════════════════════════════════════════════════

    // Valid labels — the canonical label set for your task.
    // Model outputs must map to these (via aliases below).
    var VALID_LABELS = [
        "label_1", "label_2", "label_3", "label_4", "label_5"
        // Example (allergens): "milk", "eggs", "fish", "shellfish",
        //   "tree nuts", "peanuts", "wheat", "soybeans", "sesame"
        // Example (ICD codes): "J06.9", "J18.9", "R05", "R50.9"
    ];

    // Aliases — map common variants/synonyms to canonical labels.
    // Keys are lowercase. Values must be in VALID_LABELS.
    var LABEL_ALIASES = {
        // Example (allergens):
        // "soy": "soybeans", "soya": "soybeans", "edamame": "soybeans",
        // "dairy": "milk", "whey": "milk", "casein": "milk", "lactose": "milk",
        // "egg": "eggs", "albumin": "eggs",
        // "peanut": "peanuts", "groundnut": "peanuts",
        // "almond": "tree nuts", "walnut": "tree nuts", "cashew": "tree nuts",
        // "semolina": "wheat", "spelt": "wheat", "durum": "wheat",
        // "tahini": "sesame"
    };

    // F-beta parameter — controls precision vs recall tradeoff.
    //   β=0.5: precision-heavy (1 FP costs as much as 4 FN). Use for
    //          safety-critical tasks (allergens, medical, compliance).
    //   β=1.0: balanced F1. Use for general tagging/NER.
    //   β=2.0: recall-heavy. Use for screening/search.
    // Ref: MO-GRPO (arXiv:2509.22047) — GRPO advantage biased toward
    //   higher-variance components; β<1 counteracts recall's variance advantage.
    var BETA = 0.5;

    // Per-false-positive penalty — deducted from score for each FP.
    // Creates smooth continuous cost that GRPO can optimize against.
    // 0.15 = 2 FPs on a 4-label prediction drops score below 0.70.
    var FP_PENALTY = 0.15;

    // Precision floor — if precision drops below this, cap the total score.
    // Prevents over-predicting completions from outranking correct ones in
    // GRPO group comparisons.
    // Ref: CoRPO (arXiv:2511.04439) — ~18% of failed rollouts get positive
    //   GRPO advantage without this guard.
    var PRECISION_FLOOR = 0.67;
    var PRECISION_FLOOR_CAP = 0.40;

    // Brevity bonus — reward concise correct answers.
    // Set to 0 to disable. Set to expected max words for the task.
    var BREVITY_BONUS_MAX_WORDS = 15;

    // "None" label — what the model should output when no labels apply.
    var NONE_KEYWORD = "none";

    // ═══════════════════════════════════════════════════════
    // END CUSTOMIZATION — code below is generic
    // ═══════════════════════════════════════════════════════

    // ─── Extract response and ground truth ───
    var response = "";
    if (input.response && typeof input.response === "string") {
        response = input.response;
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        var lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
    }

    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string")
        ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    // ─── Guard clauses ───
    if (!response || response.trim().length === 0) {
        return { score: 0, reason: "Response is empty" };
    }
    if (!groundTruth || groundTruth.trim().length === 0) {
        return { score: 0, reason: "No ground truth provided" };
    }

    // ─── Parse ground truth labels ───
    var gtLabels = parseLabels(groundTruth, VALID_LABELS, LABEL_ALIASES);
    var gtIsNone = (gtLabels.length === 0);

    // ─── Parse model response — regex first, LLM fallback ───
    var modelLabels = parseLabels(response, VALID_LABELS, LABEL_ALIASES);
    var modelSaysNone = isNoneResponse(response, NONE_KEYWORD);
    var extractionMethod = "regex";

    // LLM fallback if regex found nothing and response isn't "none".
    // Distinguish 3 cases: valid labels / explicit none / garbage (off-topic).
    // Garbage responses MUST NOT be treated as "model said none".
    var isGarbage = false;
    if (modelLabels.length === 0 && !modelSaysNone && response.trim().length > 2) {
        var llmResult = extractLabelsWithLLM(response, input, VALID_LABELS);
        if (llmResult !== null) {
            extractionMethod = "llm";
            if (llmResult.category === "none") {
                modelSaysNone = true;
            } else if (llmResult.category === "valid" && llmResult.labels) {
                modelLabels = parseLabels(llmResult.labels, VALID_LABELS, LABEL_ALIASES);
            } else {
                // category === "garbage" — off-topic response, NOT "none"
                isGarbage = true;
            }
        }
    }

    // Garbage response = wrong, regardless of GT. Nonzero floor for GRPO gradient.
    if (isGarbage) {
        return {
            score: 0.05,
            reason: "Garbage response (off-topic, no valid labels, not 'none'). Response: " + response.substring(0, 100),
            precision: 0, recall: 0, fbeta: 0,
            tp: 0, fp: 0, fn: gtLabels.length,
            extraction_method: extractionMethod
        };
    }

    // ─── Handle "none" cases ───

    // GT=none, model=none → perfect
    if (gtIsNone && modelSaysNone && modelLabels.length === 0) {
        var noneScore = 0.95;
        var wordCount = response.split(/\s+/).length;
        if (BREVITY_BONUS_MAX_WORDS > 0 && wordCount <= BREVITY_BONUS_MAX_WORDS) {
            noneScore = 1.0;
        }
        return {
            score: noneScore,
            reason: "Correct: no labels present, model said '" + NONE_KEYWORD + "'. Words=" + wordCount,
            precision: 1.0, recall: 1.0, fbeta: 1.0,
            tp: 0, fp: 0, fn: 0,
            extraction_method: extractionMethod
        };
    }

    // GT=none, model listed labels → false positives only
    if (gtIsNone && modelLabels.length > 0) {
        var fpOnlyScore = Math.max(0.02, 0.10 - (modelLabels.length * 0.02));
        return {
            score: fpOnlyScore,
            reason: "Wrong: GT=" + NONE_KEYWORD + " but model listed " + modelLabels.length +
                " label(s): " + modelLabels.join(", ") + ". All are false positives.",
            precision: 0, recall: 1.0, fbeta: 0,
            tp: 0, fp: modelLabels.length, fn: 0,
            extraction_method: extractionMethod
        };
    }

    // GT has labels, model=none → missed everything
    if (!gtIsNone && modelSaysNone && modelLabels.length === 0) {
        return {
            score: 0.05,
            reason: "Wrong: model said '" + NONE_KEYWORD + "' but GT=" +
                gtLabels.join(", ") + ". Missed all " + gtLabels.length + " label(s).",
            precision: 0, recall: 0, fbeta: 0,
            tp: 0, fp: 0, fn: gtLabels.length,
            extraction_method: extractionMethod
        };
    }

    // ─── Compute set comparison ───
    var tp = 0, fp = 0, fn = 0;
    for (var i = 0; i < modelLabels.length; i++) {
        if (gtLabels.indexOf(modelLabels[i]) !== -1) {
            tp++;
        } else {
            fp++;
        }
    }
    for (var j = 0; j < gtLabels.length; j++) {
        if (modelLabels.indexOf(gtLabels[j]) === -1) {
            fn++;
        }
    }

    // ─── Compute F-beta ───
    var precision = (tp + fp > 0) ? tp / (tp + fp) : 0;
    var recall = (tp + fn > 0) ? tp / (tp + fn) : 0;
    var betaSq = BETA * BETA;
    var fbeta = (precision + recall > 0)
        ? ((1 + betaSq) * precision * recall) / (betaSq * precision + recall)
        : 0;

    // ─── Stratified scoring with recall completeness penalty ───
    //
    // GRPO needs wide reward gaps between partial and perfect answers.
    // If 1-of-2 labels correct scores 0.78, and all K=8 completions
    // produce the same partial answer, std(reward)=0 → zero gradient
    // → the model never learns to find the missing label.
    //
    // Fix: score = F-beta × recall_completeness, where completeness
    // penalizes missing labels proportionally. 1-of-2 correct = 0.50
    // recall → completeness penalty makes score ~0.40 (not 0.78).
    // This creates a 0.60 gap to perfect (1.0), large enough for
    // GRPO to distinguish when even one completion finds both labels.
    //
    // Ref: arXiv:2511.04439 (ordinal reward trap in GRPO),
    //      arXiv:2506.02355 (distribution sharpening on partial),
    //      HERO arXiv:2510.07242 (stratified tiers: correct > wrong)
    var baseScore;
    var gtCount = gtLabels.length;
    // Recall completeness: what fraction of GT labels did model find?
    var completeness = (gtCount > 0) ? tp / gtCount : 1.0;

    if (tp === gtCount && fp === 0) {
        // Perfect match: 0.90-1.0 (brevity bonus can push to 1.0)
        baseScore = 0.90 + (fbeta - 0.90) * 0.10;
        if (baseScore < 0.90) baseScore = 0.90;
    } else if (tp === gtCount && fp > 0) {
        // All GT labels found but with extra FPs: 0.50-0.70
        // Good recall but imprecise — FP penalty below will reduce further
        baseScore = 0.50 + completeness * 0.20;
    } else if (tp > 0) {
        // Partial match: score scales with completeness
        // 1-of-2 correct (50% completeness) → 0.30
        // 2-of-3 correct (67% completeness) → 0.40
        // 1-of-4 correct (25% completeness) → 0.20
        // Wide gap to perfect (0.90+) ensures GRPO gradient flows
        baseScore = 0.10 + completeness * 0.50;
    } else {
        // No correct labels at all: 0.05 (nonzero for gradient)
        baseScore = 0.05;
    }

    // ─── TP-tiered floor (CoRPO R_min_correct principle) ───
    // Partial-correct records MUST score above completely-wrong records, or
    // GRPO cannot distinguish "1 TP + 2 FP" from "0 TP + 0 FP" — both collapse
    // to the same 0.05 floor and produce zero gradient between them.
    //
    // Floor scales with TP ratio so more-correct = higher minimum:
    //   tp=0:       floor = 0.05 (wrong tier)
    //   tp=1/4:     floor = 0.22 + 0.025 = 0.245
    //   tp=1/2:     floor = 0.22 + 0.050 = 0.270
    //   tp=2/3:     floor = 0.22 + 0.067 = 0.287
    //   tp=1/1:     floor = 0.22 + 0.100 = 0.320
    // This creates 3 non-overlapping tiers: wrong [0-0.20], partial [0.22-0.90], correct [0.90-1.0].
    // Ref: CoRPO (arXiv:2511.04439) R_min_correct, HERO (arXiv:2510.07242) stratified tiers
    var tpFloor = (tp > 0 && gtCount > 0) ? 0.22 + (tp / gtCount) * 0.10 : 0.05;

    // ─── Proportional FP penalty ───
    // Penalty grows with fpRate = fp/(tp+fp) = over-prediction fraction.
    // Bounded by the room above tpFloor so FPs can NEVER erase TP credit
    // below the tier boundary.
    //
    // Example: tp=1, fp=2, gtCount=2
    //   baseScore = 0.35 (partial branch)
    //   tpFloor   = 0.27
    //   fpRate    = 2/3 = 0.667
    //   maxPen    = min(0.30, 0.35 - 0.27 + 0.15) = min(0.30, 0.23) = 0.23
    //   penalty   = 0.667 * 0.23 = 0.153
    //   score     = max(0.27, 0.35 - 0.153) = max(0.27, 0.197) = 0.27
    // Result: partial+FPs scores 0.27, not 0.05. GRPO can now rank it above wrong.
    //
    // Ref: MO-GRPO Theorem 1 (arXiv:2509.22047) — recall has higher variance than
    //      precision, so we need precision pressure proportional to over-prediction.
    if (fp > 0) {
        var fpRate = fp / Math.max(1, tp + fp);          // over-prediction fraction
        var maxPenalty = Math.max(0, baseScore - tpFloor); // bounded by tier headroom
        var fpPenalty = fpRate * Math.min(0.30, maxPenalty + 0.15);
        baseScore = Math.max(tpFloor, baseScore - fpPenalty);
    }

    // ─── Precision floor hard cap (safety net) ───
    // Relaxed to 0.50 from 0.67 — the proportional FP penalty above now
    // handles most cases. This remains as a safety net for extreme precision
    // drops (e.g., precision < 0.25 with many FPs), capped at 0.40.
    // Ref: CoRPO (arXiv:2511.04439)
    if (fp > 0 && precision < 0.50) {
        baseScore = Math.min(baseScore, PRECISION_FLOOR_CAP);
    }

    // ─── Over-prediction defense (dump-all-labels attack) ───
    // Empirically observed: weak models dump all 9 Big 9 allergens to guarantee
    // hitting TP. This gets precision=1/9 and F-beta near 0 but the tp-tiered
    // floor was letting it score 0.27+. We need a harder cap when the model
    // predicts significantly MORE labels than GT contains.
    //
    // Override tpFloor in extreme over-prediction: if precision < 0.30 AND the
    // model predicted 3+ extra labels beyond GT, cap at 0.15 (above wrong tier
    // 0.05 but below normal partial tier ~0.27).
    // Ref: MO-GRPO Theorem 1 (arXiv:2509.22047)
    var extraLabels = modelLabels.length - gtCount;
    if (precision < 0.30 && extraLabels >= 3) {
        baseScore = Math.min(baseScore, 0.15);
        tpFloor = Math.min(tpFloor, 0.15);  // override the final guard too
    }

    // ─── Enforce TP-tier floor as final guard ───
    // After any penalties, ensure partial-correct still scores above wrong tier.
    if (tp > 0 && baseScore < tpFloor) {
        baseScore = tpFloor;
    }

    // ─── Brevity bonus (correct answers only, DRPO-safe) ───
    // Only for perfect matches — no bonus on partial to avoid
    // rewarding short wrong answers.
    // Ref: DRPO (arXiv:2510.04474) — never penalize correct answers.
    var wordCount = response.split(/\s+/).length;
    var brevityNote = "";
    if (fbeta >= 0.99 && BREVITY_BONUS_MAX_WORDS > 0 && wordCount <= BREVITY_BONUS_MAX_WORDS) {
        baseScore = Math.min(1.0, baseScore + 0.05);
        brevityNote = " Brevity bonus: +0.05 (" + wordCount + " words)";
    }

    // ─── Ensure nonzero floor for attempted answers ───
    // GRPO needs nonzero scores for gradient signal (DAPO arXiv:2503.14476).
    if (baseScore < 0.05 && modelLabels.length > 0) {
        baseScore = 0.05;
    }

    // ─── Clamp and return ───
    var finalScore = Math.max(0, Math.min(1.0, baseScore));
    if (isNaN(finalScore)) finalScore = 0;

    return {
        score: finalScore,
        reason: "Fbeta(" + BETA + ")=" + fbeta.toFixed(2) +
            " P=" + precision.toFixed(2) +
            " R=" + recall.toFixed(2) +
            " | TP=" + tp + " FP=" + fp + " FN=" + fn +
            " | Model: " + (modelLabels.length > 0 ? modelLabels.join(", ") : "(" + NONE_KEYWORD + ")") +
            " | GT: " + gtLabels.join(", ") +
            " | Extraction: " + extractionMethod + brevityNote,
        precision: precision,
        recall: recall,
        fbeta: fbeta,
        beta: BETA,
        tp: tp, fp: fp, fn: fn,
        extraction_method: extractionMethod
    };
}

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Parse a text string into a deduplicated array of canonical labels.
 * Handles: comma-separated, JSON arrays, bullet lists, plain text.
 * Resolves aliases to canonical forms.
 */
function parseLabels(text, validLabels, aliases) {
    if (!text) return [];
    var lower = text.toLowerCase().trim();

    // Handle explicit "none"
    if (lower === "none" || lower === "none.") return [];

    // ─── Negation detection ───
    // Build a set of negated labels: "no milk", "not milk", "without milk",
    // "free from milk", "milk-free", "contains no milk", "no X, Y, or Z"
    // Research: closed-vocabulary grading must handle negation or the model
    // can trick the grader by saying "contains no milk" and scoring positive.
    var negated = {};
    var negationPrefix = "(?:no|not|without|excluding|free[\\s-]from|contains no|has no)";
    for (var n = 0; n < validLabels.length; n++) {
        var lbl = validLabels[n];
        var lblEsc = lbl.replace(/\s+/g, "\\s+");
        // Check "no <label>", "free from <label>", etc.
        var negPattern = new RegExp("\\b" + negationPrefix + "\\s+" + lblEsc + "\\b", "i");
        // Check "<label>-free"
        var suffixPattern = new RegExp("\\b" + lblEsc + "[\\s-]free\\b", "i");
        if (negPattern.test(lower) || suffixPattern.test(lower)) {
            negated[lbl] = true;
        }
    }
    // Also check aliases for negation
    var aliasKeysNeg = Object.keys(aliases);
    for (var na = 0; na < aliasKeysNeg.length; na++) {
        var aliasNeg = aliasKeysNeg[na];
        var canonicalNeg = aliases[aliasNeg];
        if (negated[canonicalNeg]) continue;
        var aliasEscNeg = aliasNeg.replace(/\s+/g, "\\s+");
        var aliasNegPattern = new RegExp("\\b" + negationPrefix + "\\s+" + aliasEscNeg + "\\b", "i");
        if (aliasNegPattern.test(lower)) {
            negated[canonicalNeg] = true;
        }
    }

    var found = [];

    // Strategy 1: Match valid labels directly (word boundary)
    for (var i = 0; i < validLabels.length; i++) {
        var label = validLabels[i];
        if (negated[label]) continue;  // Skip negated labels
        var pattern = new RegExp("\\b" + label.replace(/\s+/g, "\\s+") + "\\b", "i");
        if (pattern.test(lower)) {
            found.push(label);
        }
    }

    // Strategy 2: Match aliases
    var aliasKeys = Object.keys(aliases);
    for (var j = 0; j < aliasKeys.length; j++) {
        var alias = aliasKeys[j];
        var canonical = aliases[alias];
        if (negated[canonical]) continue;  // Skip negated canonical labels
        if (found.indexOf(canonical) === -1) {
            var aliasPattern = new RegExp("\\b" + alias.replace(/\s+/g, "\\s+") + "\\b", "i");
            if (aliasPattern.test(lower)) {
                found.push(canonical);
            }
        }
    }

    // Deduplicate
    var unique = [];
    for (var k = 0; k < found.length; k++) {
        if (unique.indexOf(found[k]) === -1) {
            unique.push(found[k]);
        }
    }

    return unique;
}

/**
 * Check if the response is a "none" / "no labels" response.
 * Recognizes common ways to express "no labels apply":
 *   "none", "no", "nothing", "n/a", "nope", "no allergens", "no labels",
 *   "no match", "none of the above", "not applicable", "nil"
 * Also matches these as leading tokens: "none." "no, ..." "nothing found"
 */
function isNoneResponse(response, noneKeyword) {
    var trimmed = response.trim().toLowerCase().replace(/[.!]+$/, "");
    if (!trimmed) return false;

    // Exact match on common none-variants
    var noneVariants = [
        noneKeyword, "none", "no", "nope", "nothing", "n/a", "na", "nil",
        "no allergens", "no labels", "no match", "not applicable",
        "nothing found", "no matches", "none of the above", "no results",
        "no, none", "no.", "none found"
    ];
    for (var i = 0; i < noneVariants.length; i++) {
        if (trimmed === noneVariants[i]) return true;
    }

    // Match "none" or "no" at the start of the response, followed by period/comma/end
    if (/^(none|no|nothing|n\/a|nil)([.,;\s]|$)/.test(trimmed)) {
        // Make sure the response doesn't ALSO contain something that looks like a label
        // (e.g., "no milk" means "milk is absent" but "milk" is a label — handled by regex parsing)
        // This function only returns true for pure "none" responses.
        var rest = trimmed.replace(/^(none|no|nothing|n\/a|nil)[.,;\s]*/, "").trim();
        if (rest.length === 0 || /^(allergens?|labels?|found|matches?|of the above|applicable|results?)[.,;\s]*$/.test(rest)) {
            return true;
        }
    }

    return false;
}

/**
 * LLM-based label extraction fallback.
 * Called when regex parsing found nothing but response isn't empty.
 * Uses structured output to prevent LLM from hallucinating labels.
 *
 * Ref: xFinder (arXiv:2405.11874) — regex accuracy 74%, LLM 93%.
 */
function extractLabelsWithLLM(response, input, validLabels) {
    var config = {
        prompt_template: [
            {
                role: "system",
                content: "You classify a model response into one of three categories. The response was expected to output label(s) from this EXACT set: " + validLabels.join(", ") + "\n\n" +
                    "CRITICAL: You must check if the response uses the EXACT label names above, possibly with minor formatting variations (case, punctuation, extra words). You must NOT infer or derive labels from domain knowledge — the model is being evaluated on FORMAT COMPLIANCE.\n\n" +
                    "Categories:\n" +
                    "1. 'valid' — the response EXPLICITLY contains one or more of the exact label names above. Acceptable: 'milk, eggs', 'Milk and eggs.', 'The allergens are milk and eggs'. NOT ACCEPTABLE: 'whey' (that's an ingredient, not the label 'milk'), 'anchovy extract' (ingredient, not 'fish'), 'sodium caseinate' (ingredient, not 'milk').\n" +
                    "2. 'none' — the response EXPLICITLY states no labels apply (e.g., 'none', 'no allergens', 'nothing', 'no match').\n" +
                    "3. 'garbage' — the response is off-topic, repeats the input, lists ingredients instead of labels, or produces unrelated content.\n\n" +
                    "Do NOT treat 'response has no valid labels' as 'none'. Do NOT infer labels from ingredient names. A response listing ingredients (even if those ingredients imply certain labels) is 'garbage', not 'valid'."
            },
            {
                role: "user",
                content: "Model response:\n\n{{response}}\n\n" +
                    "Which EXACT labels from the valid set does this response explicitly contain? Return JSON: {\"category\": \"valid\" or \"none\" or \"garbage\", \"labels\": \"comma-separated list of exact matches from the valid set, empty otherwise\"}"
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                category: { type: "string", enum: ["valid", "none", "garbage"] },
                labels: { type: "string" }
            },
            required: ["category", "labels"],
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
        // Returns {category, labels} object
        var category = (result.category || "garbage").trim();
        var labels = (result.labels || "").trim();
        return { category: category, labels: labels };
    } catch (e) {
        return null;
    }
}
