// trace_grader.js — Stage 4: programmatic Jaccard grader for tool calls.
//
// Deterministic scorer: (predicted_tool_call, ground_truth_tool_call) → [floor, 1.0].
// No LLM. Used by cloud training (Stage 7) and cloud eval (Stage 8).
//
// Formula (ToolRL-grounded, arXiv:2504.13958):
//
//     r_name  = 1 if normalize_name(pred) == normalize_name(gt) else 0
//     r_param = |keys(gt) ∩ keys(pred)| / |keys(gt) ∪ keys(pred)|   (Jaccard)
//     r_value = |{ k ∈ intersect : gt[k] == pred[k] }|
//     S_raw   = r_name + r_param + r_value
//     S_max   = 1 + len(gt_args)                                    # name + one per arg
//     score   = clamp(S_raw / S_max, floor=0.02, ceiling=1.0)
//
// Wrong tool name → 0.02 floor (never 0.0 — zero-variance kills GRPO
// per feedback_grader_no_zero_hard_gate: a grader returning 0.0 for
// attempted answers causes 80% zero-variance prompts, producing flat
// training. Use 0.02 minimum so the model always gets a nonzero gradient
// signal — arXiv:2509.21880 "No Prompt Left Behind" confirms zero-variance
// prompt frequency is already 30–99% per batch without floor issues).
//
// GRADER_CONFIG is injected as a global by the publish step or cloud runner.
// Shape: { wrong_tool_floor, case_insensitive_params, tool_schema, formula_version }

// When embedded by the publish step, GRADER_CONFIG is declared above this file.
// When running standalone (e.g. tests), it may not exist — fall back to defaults.
// Using var (not const) so the publish step's `const GRADER_CONFIG = ...` above
// doesn't cause a duplicate-declaration error when this file is concatenated.
// eslint-disable-next-line no-undef, no-var
var CONFIG = typeof GRADER_CONFIG !== "undefined" ? GRADER_CONFIG : {};
var WRONG_TOOL_FLOOR = CONFIG.wrong_tool_floor != null ? CONFIG.wrong_tool_floor : 0.02;

// Runtime assertion: warn if GRADER_CONFIG was not injected (e.g. cloud
// sandbox didn't prepend it). The grader still works (floor=0.02) but
// case_insensitive_params will be empty, losing enum-sensitivity.
if (!CONFIG.tool_schema || CONFIG.tool_schema.length === 0) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(
      "[trace_grader.js] GRADER_CONFIG.tool_schema is empty — " +
      "case_insensitive_params will not apply. Was GRADER_CONFIG prepended?"
    );
  }
}

// Build a Set of "tool|param" keys for O(1) lookup of case-insensitive params.
// These are string-enum parameters (e.g. HTTP method, category) where
// "GET" should match "get" — detected at build time by trace_grader_builder.py.
// eslint-disable-next-line no-var
var CASE_INSENSITIVE_SET = new Set(
  (CONFIG.case_insensitive_params || []).map(
    (entry) => `${(entry.tool || "").toLowerCase()}|${entry.param}`
  )
);


// ─── Normalization helpers ──────────────────────────────────────────────────

/**
 * Case-insensitive, whitespace-trimmed name normalization.
 * Matches Python: name.strip().lower()
 */
function normalizeName(name) {
  if (name == null) return "";
  return String(name).trim().toLowerCase();
}

/**
 * Check if a param is in the case-insensitive set for a given tool.
 */
function isCaseInsensitiveParam(toolName, paramName) {
  const key = `${normalizeName(toolName)}|${paramName}`;
  return CASE_INSENSITIVE_SET.has(key);
}

/**
 * Normalize a value for exact-match comparison.
 *
 * Rules (matching trace_grader.py exactly):
 *   - null/undefined → null
 *   - boolean → tagged tuple ["__bool__", value] (so true !== 1)
 *   - number → number (int/float are the same type in JS, no issue)
 *   - string → trimmed (case preserved by default)
 *   - array → JSON of normalized elements (order-preserving)
 *   - object → JSON of sorted [key, value] pairs (order-independent)
 *   - other → passed through
 *
 * Python gotcha: Python's `True == 1` is `True`. JavaScript's `true === 1`
 * is `false`, but `true == 1` is `true`. We tag booleans to match the Python
 * behavior of distinguishing bool from int, which matters for tool routing
 * (e.g. `verified=true` should not match `verified=1`).
 *
 * Returns a string representation for reliable equality comparison, since
 * JS objects/arrays can't be compared with ===.
 */
function normalizeValue(v) {
  if (v === null || v === undefined) {
    return "__null__";
  }
  if (typeof v === "boolean") {
    // Tag booleans so they don't compare equal to numeric 0/1.
    // Matches Python's ("__bool__", v) tagging.
    return `__bool__:${v}`;
  }
  if (typeof v === "number") {
    return `__num__:${v}`;
  }
  if (typeof v === "string") {
    return `__str__:${v.trim()}`;
  }
  if (Array.isArray(v)) {
    // Order-preserving — [1, 2] !== [2, 1]
    const items = v.map((x) => normalizeValue(x));
    return `__arr__:[${items.join(",")}]`;
  }
  if (typeof v === "object") {
    // Order-independent — sort by key
    const entries = Object.keys(v)
      .sort()
      .map((k) => `${normalizeValue(k)}=${normalizeValue(v[k])}`);
    return `__obj__:{${entries.join(",")}}`;
  }
  return `__other__:${String(v)}`;
}

/**
 * Compare two values for equality after normalization.
 * Optionally applies case-insensitive string comparison for enum params.
 */
function valuesEqual(predVal, gtVal, caseInsensitive) {
  if (caseInsensitive && typeof predVal === "string" && typeof gtVal === "string") {
    return normalizeValue(predVal.toLowerCase()) === normalizeValue(gtVal.toLowerCase());
  }
  return normalizeValue(predVal) === normalizeValue(gtVal);
}


// ─── Jaccard + value matching primitives ────────────────────────────────────

/**
 * Jaccard overlap on the key sets. Empty-vs-empty = 1.0 (convention).
 */
function jaccardKeys(a, b) {
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));

  const unionSize = new Set([...keysA, ...keysB]).size;
  if (unionSize === 0) return 1.0; // both empty → trivially equal

  let intersectCount = 0;
  for (const k of keysA) {
    if (keysB.has(k)) intersectCount++;
  }
  return intersectCount / unionSize;
}

/**
 * Count keys in the intersection where normalized values are equal.
 */
function countValueMatches(predArgs, gtArgs, toolName) {
  const predKeys = new Set(Object.keys(predArgs));
  let count = 0;
  for (const k of Object.keys(gtArgs)) {
    if (!predKeys.has(k)) continue;
    const ci = isCaseInsensitiveParam(toolName, k);
    if (valuesEqual(predArgs[k], gtArgs[k], ci)) {
      count++;
    }
  }
  return count;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}


// ─── Single-call grader ─────────────────────────────────────────────────────

/**
 * Score a single predicted tool call against ground truth.
 *
 * @param {object} pred - {name: string, arguments: object}
 * @param {object} gt   - {name: string, arguments: object}
 * @returns {number} Score in [WRONG_TOOL_FLOOR, 1.0]
 */
function gradeSingle(pred, gt) {
  const predName = normalizeName(pred.name);
  const gtName = normalizeName(gt.name);

  // Wrong tool → floor. Never 0.0.
  if (predName === "" || predName !== gtName) {
    return WRONG_TOOL_FLOOR;
  }

  const predArgs = pred.arguments || {};
  const gtArgs = gt.arguments || {};

  const rName = 1.0;
  const rParam = jaccardKeys(predArgs, gtArgs);
  const rValue = countValueMatches(predArgs, gtArgs, gt.name);

  const sRaw = rName + rParam + rValue;
  const sMax = 1 + Object.keys(gtArgs).length; // 1 for name + 1 per GT arg

  const score = sRaw / sMax;
  return clamp(score, WRONG_TOOL_FLOOR, 1.0);
}


// ─── Parallel-call grader (Pattern D) ───────────────────────────────────────

/**
 * Find the index of the best-matching GT call that hasn't been consumed.
 */
function bestMatchIdx(predCall, gtCalls, taken) {
  let bestIdx = null;
  let bestScore = -1.0;
  for (let i = 0; i < gtCalls.length; i++) {
    if (taken.has(i)) continue;
    const s = gradeSingle(predCall, gtCalls[i]);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Score a parallel tool-call set (Pattern D) against the ground truth.
 *
 * Uses per-call mean × coverage penalty: each predicted call is matched
 * to its best-matching remaining GT call (greedy, GT consumed once per
 * match), per-call scores are averaged, then multiplied by
 * min(|pred|, |gt|) / max(|pred|, |gt|) to penalize missing or extra
 * calls symmetrically.
 *
 * Refusal: empty-vs-empty call sets → 1.0 (correctly refused).
 * Hallucinated call vs empty GT → floor.
 * Missed call vs non-empty GT → floor.
 */
function gradeParallel(predCalls, gtCalls) {
  // Refusal cases
  if (predCalls.length === 0 && gtCalls.length === 0) return 1.0;
  if (predCalls.length === 0 || gtCalls.length === 0) return WRONG_TOOL_FLOOR;

  // Greedy best-match, consuming each GT call at most once
  const taken = new Set();
  const perCallScores = [];
  for (const p of predCalls) {
    const idx = bestMatchIdx(p, gtCalls, taken);
    if (idx === null) {
      perCallScores.push(WRONG_TOOL_FLOOR);
    } else {
      taken.add(idx);
      perCallScores.push(gradeSingle(p, gtCalls[idx]));
    }
  }

  const meanPerCall =
    perCallScores.reduce((sum, s) => sum + s, 0) / perCallScores.length;
  const coverage =
    Math.min(predCalls.length, gtCalls.length) /
    Math.max(predCalls.length, gtCalls.length);
  const score = meanPerCall * coverage;
  return clamp(score, WRONG_TOOL_FLOOR, 1.0);
}


// ─── Message parser ─────────────────────────────────────────────────────────

/**
 * Extract tool calls from an OpenAI chat-completion assistant message.
 *
 * Input shape (from cloud evaluator):
 *   {
 *     role: "assistant",
 *     tool_calls: [{
 *       type: "function",
 *       function: { name: "search", arguments: '{"q": "tablet"}' }
 *     }]
 *   }
 *
 * Returns array of {name, arguments} objects.
 * Handles: missing tool_calls, non-array tool_calls, unparseable arguments.
 */
function extractToolCalls(message) {
  if (!message || typeof message !== "object") return [];

  const rawCalls = message.tool_calls;
  if (!Array.isArray(rawCalls)) return [];

  const result = [];
  for (const call of rawCalls) {
    if (!call || typeof call !== "object") continue;

    const fn = call.function || call;
    const name = fn.name || null;

    let args = fn.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        // Unparseable arguments → treat as empty (wrong values will reduce score)
        args = {};
      }
    }
    if (args == null || typeof args !== "object" || Array.isArray(args)) {
      args = {};
    }

    result.push({ name, arguments: args });
  }
  return result;
}


// ─── Main grade function (cloud evaluator entry point) ──────────────────────

/**
 * Grade a predicted assistant message against the expected ground truth.
 *
 * This is the entry point called by the LangDB Cloud evaluator.
 * Both `predicted` and `expected` are OpenAI chat-completion assistant
 * messages with tool_calls arrays.
 *
 * @param {object} predicted - The model's output message
 * @param {object} expected  - The ground truth message
 * @returns {{ score: number, reason: string }}
 */
function grade(predicted, expected) {
  // Extract tool calls from both messages
  const predCalls = extractToolCalls(predicted);
  const gtCalls = extractToolCalls(expected);

  // Single-call fast path (most common case)
  if (predCalls.length <= 1 && gtCalls.length <= 1) {
    if (predCalls.length === 0 && gtCalls.length === 0) {
      return { score: 1.0, reason: "correct refusal: no tool calls expected or predicted" };
    }
    if (predCalls.length === 0) {
      return {
        score: WRONG_TOOL_FLOOR,
        reason: "missed call: expected tool call but model produced none",
      };
    }
    if (gtCalls.length === 0) {
      return {
        score: WRONG_TOOL_FLOOR,
        reason: `hallucinated call: model called ${predCalls[0].name} but no call expected`,
      };
    }

    const score = gradeSingle(predCalls[0], gtCalls[0]);
    const pred = predCalls[0];
    const gt = gtCalls[0];

    if (score >= 1.0) {
      return { score: 1.0, reason: `perfect match: ${gt.name}` };
    }
    if (normalizeName(pred.name) !== normalizeName(gt.name)) {
      return {
        score,
        reason: `wrong tool: predicted ${pred.name}, expected ${gt.name}`,
      };
    }
    return {
      score: Math.round(score * 1000) / 1000,
      reason: `partial match on ${gt.name}: score=${score.toFixed(3)}`,
    };
  }

  // Multi-call path (Pattern D: parallel tool calls)
  const score = gradeParallel(predCalls, gtCalls);

  if (score >= 1.0) {
    return {
      score: 1.0,
      reason: `perfect parallel match: ${gtCalls.length} calls`,
    };
  }
  return {
    score: Math.round(score * 1000) / 1000,
    reason: `parallel match: ${predCalls.length} predicted vs ${gtCalls.length} expected, score=${score.toFixed(3)}`,
  };
}
