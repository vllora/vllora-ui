# /// script
# requires-python = ">=3.10"
# ///
"""
grader_from_traces.py — Auto-generate a grader draft from trace analysis hints.

Reads trace_grader_hints.json (produced by trace_analyze.py) and generates
a JavaScript grader file following the vLLora checklist rubric pattern.

The generated grader is a DRAFT — the user must review and adjust before
training. Trace-derived dimensions target real failure modes; prompt rules
provide explicit constraint checks.

Research basis:
  - Constitutional AI (arXiv:2212.08073): rules → reward signals
  - "No Prompt Left Behind" (arXiv:2509.21880): grader must produce variance
    on dimensions where the model actually struggles
  - Reward model overoptimization (arXiv:2210.10760): calibrate grader
    against known success/failure traces

Usage:
    python3 grader_from_traces.py \\
        --hints trace_grader_hints.json \\
        --output grader-draft.js
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _escape_js_string(s: str) -> str:
    """Escape a string for safe embedding in JS source."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "")
    )


def generate_grader_js(hints: dict) -> str:
    """Generate a JavaScript grader from trace_grader_hints.json."""
    dimensions = hints.get("dimensions", [])
    prompt_rules = hints.get("prompt_rules_as_criteria", [])

    # Separate trace-derived and rule-derived dimensions
    trace_dims = [d for d in dimensions if d.get("source") == "trace_failure"]
    rule_dims = [d for d in dimensions if d.get("source") == "prompt_rule"]

    # Build rubric criteria from dimensions
    # Prioritize by failure rate (highest failure = most important to check)
    trace_dims.sort(key=lambda d: d.get("failure_rate", 0), reverse=True)

    criteria_lines: list[str] = []
    criteria_names: list[str] = []

    # Add trace-derived criteria (Essential — these are where the model actually fails)
    for i, dim in enumerate(trace_dims[:8]):  # cap at 8 trace dimensions
        name = dim["name"].replace("-", "_").replace(" ", "_")
        desc = _escape_js_string(dim["description"])
        fail_rate = dim.get("failure_rate", 0)
        category = "Essential" if fail_rate > 0.3 else "Important"
        criteria_lines.append(
            f'        {{ name: "{name}", '
            f'question: "{desc}", '
            f'category: "{category}", '
            f'source: "trace_failure", '
            f'failure_rate: {fail_rate:.3f} }}'
        )
        criteria_names.append(name)

    # Add rule-derived criteria (Important — explicit constraints from production prompt)
    for i, dim in enumerate(rule_dims[:10]):  # cap at 10 rule dimensions
        name = dim["name"].replace("-", "_").replace(" ", "_")
        desc = _escape_js_string(dim["description"])
        criteria_lines.append(
            f'        {{ name: "{name}", '
            f'question: "{desc}", '
            f'category: "Important", '
            f'source: "prompt_rule" }}'
        )
        criteria_names.append(name)

    criteria_block = ",\n".join(criteria_lines)

    # Generate the grader JS
    return f"""/**
 * Auto-Generated Grader Draft — Trace-Informed Checklist Rubric
 *
 * Generated from trace_grader_hints.json by grader_from_traces.py.
 * This is a DRAFT — review and adjust before training.
 *
 * Dimensions derived from:
 *   - {len(trace_dims)} trace failure patterns (where the model actually fails)
 *   - {len(rule_dims)} production prompt rules (explicit constraints)
 *
 * Scoring architecture:
 *   - Correctness gate (stratified): correct answers score 0.5-1.0, wrong score 0.02-0.5
 *   - Within each tier: rubric checklist determines quality score
 *   - Essential criteria (from high-failure traces) have higher weight
 *
 * IMPORTANT: Traces define WHAT to check (dimensions). PDFs + task logic
 * define WHAT IS CORRECT (scoring). Never score based on similarity to
 * the production agent's response — that causes reward hacking.
 *
 * Research basis:
 *   - Rubrics as Rewards (arXiv:2507.17746)
 *   - Constitutional AI (arXiv:2212.08073): rules → reward signals
 *   - No Prompt Left Behind (arXiv:2509.21880): grader must produce variance
 */
function evaluate(input) {{
    // 1. Extract response and history
    var response = "";
    var history = "";

    if (input.response && typeof input.response === "string") {{
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    }} else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {{
        var lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) {{
            response = lastMessage.content;
        }}
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }}

    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string") ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    // 2. Guard: empty response
    if (!response || response.trim().length < 10) {{
        return {{ score: 0.02, reason: "Response is empty or too short" }};
    }}

    // 3. Rubric criteria (auto-generated from traces + prompt rules)
    // Review these carefully — adjust descriptions and categories as needed.
    var criteria = [
{criteria_block}
    ];

    // 4. LLM-as-Judge evaluation with checklist rubric
    var systemMsg = (input.messages || []).find(function(m) {{ return m.role === "system"; }});
    var criteriaText = criteria.map(function(c, i) {{
        return (i + 1) + ". [" + c.category + "] " + c.question;
    }}).join("\\n");

    var judgeResult = __langdb_call_llm_as_judge_obj(
        {{
            model: "gpt-4o-mini",
            temperature: 0.1,
            system_message: "You are an expert evaluator. Score each criterion as PASS or FAIL.\\n" +
                "Consider the system prompt, conversation history, ground truth, and the response.\\n" +
                "Be strict on Essential criteria, moderate on Important criteria.",
            output_schema: {{
                type: "object",
                properties: {{
                    is_correct: {{ type: "boolean", description: "Does the response correctly address the user's request?" }},
                    criteria_results: {{
                        type: "array",
                        items: {{
                            type: "object",
                            properties: {{
                                criterion_index: {{ type: "number" }},
                                passed: {{ type: "boolean" }},
                                reason: {{ type: "string" }}
                            }},
                            required: ["criterion_index", "passed", "reason"]
                        }}
                    }},
                    overall_reason: {{ type: "string" }}
                }},
                required: ["is_correct", "criteria_results", "overall_reason"]
            }}
        }},
        {{
            system_prompt: systemMsg ? systemMsg.content : "",
            conversation: history,
            response: response,
            ground_truth: groundTruth,
            criteria: criteriaText
        }}
    );

    if (judgeResult.error) {{
        return {{ score: 0.3, reason: "LLM judge error: " + judgeResult.error }};
    }}

    // 5. Stratified scoring (HERO arXiv:2510.07242)
    var isCorrect = judgeResult.is_correct;
    var results = judgeResult.criteria_results || [];

    // Count passed criteria by category
    var essentialPassed = 0;
    var essentialTotal = 0;
    var importantPassed = 0;
    var importantTotal = 0;

    for (var i = 0; i < results.length; i++) {{
        var idx = results[i].criterion_index - 1;
        if (idx >= 0 && idx < criteria.length) {{
            var cat = criteria[idx].category;
            if (cat === "Essential") {{
                essentialTotal++;
                if (results[i].passed) essentialPassed++;
            }} else {{
                importantTotal++;
                if (results[i].passed) importantPassed++;
            }}
        }}
    }}

    // Compute quality score from rubric
    var essentialRatio = essentialTotal > 0 ? essentialPassed / essentialTotal : 1.0;
    var importantRatio = importantTotal > 0 ? importantPassed / importantTotal : 1.0;
    // Essential criteria weight 60%, Important 40%
    var qualityScore = 0.6 * essentialRatio + 0.4 * importantRatio;

    // Stratified: correct tier [0.5, 1.0], wrong tier [0.02, 0.5]
    var finalScore;
    if (isCorrect) {{
        finalScore = 0.5 + 0.5 * qualityScore;
    }} else {{
        finalScore = 0.02 + 0.48 * qualityScore;
    }}

    var passedCount = results.filter(function(r) {{ return r.passed; }}).length;
    return {{
        score: Math.round(finalScore * 1000) / 1000,
        reason: (isCorrect ? "CORRECT" : "WRONG") +
            " | Criteria: " + passedCount + "/" + results.length + " passed" +
            " (Essential: " + essentialPassed + "/" + essentialTotal +
            ", Important: " + importantPassed + "/" + importantTotal + ")" +
            " | " + (judgeResult.overall_reason || "")
    }};
}}
"""


def generate_tool_call_grader_js(tool_schemas: list[dict]) -> str:
    """Generate a Jaccard-based tool-call grader (ToolRL, arXiv:2504.13958).

    Scoring: 0.4 * name_match + 0.3 * param_key_jaccard + 0.3 * param_value_match
    This decomposition outperforms outcome-only rewards by 17% (ToolRL).
    """
    tool_names = [t.get("function", {}).get("name", "?") for t in tool_schemas]

    return f"""/**
 * Tool-Call Grader — Jaccard Scoring (auto-generated)
 *
 * Scores model tool calls against expected ground truth using:
 *   - Tool name match (40% weight)
 *   - Parameter key Jaccard similarity (30% weight)
 *   - Parameter value match (30% weight)
 *
 * Research: ToolRL (arXiv:2504.13958) — fine-grained tool-call rewards
 * beat outcome-only rewards by 17%.
 *
 * Valid tools: {', '.join(tool_names)}
 */
function evaluate(input) {{
    var FLOOR = 0.02;  // Minimum score for any attempted answer

    // Locate the model's response. The cloud evaluator delivers it in one of
    // two shapes depending on how the generation was routed:
    //   (a) `input.response` — string with parseable content (XML/JSON tool_call)
    //   (b) appended as the last assistant message in `input.messages` with
    //       native `tool_calls[]` and often empty `content` (Qwen's normal
    //       emission on the custom inference endpoint)
    // Miss (b) and every Qwen-native tool_call scores FLOOR. Checked in both
    // shapes; either is parsed by `parseToolCall`.
    var response = input.response;
    if ((!response || (typeof response === "string" && response.length < 3)) &&
        input.messages && Array.isArray(input.messages) && input.messages.length > 0) {{
        var lastMsg = input.messages[input.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {{
            if (lastMsg.tool_calls && lastMsg.tool_calls[0]) {{
                response = {{ tool_calls: lastMsg.tool_calls }};
            }} else if (lastMsg.content) {{
                response = lastMsg.content;
            }}
        }}
    }}

    var modelCall = parseToolCall(response);
    if (!modelCall || !modelCall.name) {{
        return {{ score: FLOOR, reason: "No valid tool call in response" }};
    }}

    // Parse expected ground truth
    var expected = input.ground_truth || input.expected;
    if (typeof expected === "string") {{
        try {{ expected = JSON.parse(expected); }} catch (e) {{ return {{ score: FLOOR }}; }}
    }}
    if (!expected || !expected.name) {{
        return {{ score: 0.5, reason: "No expected tool call — cannot score" }};
    }}

    // 1. Tool name match (40%)
    var nameScore = modelCall.name === expected.name ? 1.0 : 0.0;

    // 2. Parameter key Jaccard (30%)
    var modelKeys = Object.keys(modelCall.arguments || {{}});
    var expectedKeys = Object.keys(expected.arguments || {{}});
    var keyIntersection = modelKeys.filter(function(k) {{ return expectedKeys.indexOf(k) >= 0; }});
    var keyUnion = modelKeys.concat(expectedKeys.filter(function(k) {{ return modelKeys.indexOf(k) < 0; }}));
    var keyJaccard = keyUnion.length > 0 ? keyIntersection.length / keyUnion.length : 1.0;

    // 3. Parameter value match (30%) — IRC-normalized comparison via
    // GEOMETRIC MEAN over expected keys. Every key in the ground truth's
    // arguments is treated as load-bearing (they're all GT-derived → all
    // required for this specific call), so a single wrong or missing value
    // collapses value_score toward 0.
    //
    // Why not arithmetic mean: with 5 keys and 1 wrong value, arithmetic
    // gives 4/5 = 0.8 → the grader rewards wrong calls at ~0.94/1.0. During
    // GRPO that ~0.06 signal is invisible and the model never learns to
    // match IDs exactly. Verified via `finetune.py grader-discriminate`:
    // arithmetic-mean gap = +0.17 (fails 0.30 threshold); geometric-mean
    // gap ≥ 0.30. See `reference/grader-writing.md` § Discrimination check.
    //
    // (IRC paper, arXiv:2604.02869: naive string compare of tool-call args
    // inflates false positives by ~23.5%. `compareValue` normalizes before
    // comparing.)
    var valueProduct = 1.0;
    var nKeys = expectedKeys.length;
    for (var i = 0; i < nKeys; i++) {{
        var key = expectedKeys[i];
        var v = compareValue(
            (modelCall.arguments || {{}})[key],
            (expected.arguments || {{}})[key]
        );
        valueProduct *= v;
        if (valueProduct === 0) break;
    }}
    var valueScore = nKeys > 0 ? Math.pow(valueProduct, 1.0 / nKeys) : 1.0;

    // Composite score — multiplicative (ToolRLA-style, arXiv:2603.01620).
    // Name acts as a gate: a wrong tool name collapses the score regardless
    // of how well keys/values happen to overlap. An exact name still gets
    // meaningful credit (0.4 floor) even with zero arg match, so GRPO has
    // gradient to reward tool-selection over arg-guessing.
    // ToolRLA ablation shows +7pp over additive composition.
    var argsScore = 0.5 * keyJaccard + 0.5 * valueScore;
    var score = nameScore * (0.4 + 0.6 * argsScore);
    score = Math.max(FLOOR, score);

    return {{
        score: score,
        name_match: nameScore,
        key_jaccard: keyJaccard,
        value_match: valueScore,
        model_tool: modelCall.name,
        expected_tool: expected.name,
    }};
}}

// IRC-compliant value comparison: handles null/undefined, numeric coercion
// ("1" === 1), list-order-insensitive Jaccard, recursive dict matching, and
// whitespace/underscore/dash-tolerant string matching. Returns 0..1.
function compareValue(mv, ev) {{
    if (mv === undefined || mv === null) return (ev === undefined || ev === null) ? 1.0 : 0.0;
    if (Array.isArray(ev)) {{
        if (!Array.isArray(mv)) return 0.0;
        if (mv.length === 0 && ev.length === 0) return 1.0;
        var mSet = mv.map(canonicalize).sort();
        var eSet = ev.map(canonicalize).sort();
        var inter = 0;
        var unionMap = {{}};
        mSet.forEach(function (v) {{ unionMap[v] = 1; }});
        eSet.forEach(function (v) {{ unionMap[v] = 1; }});
        var unionCount = Object.keys(unionMap).length;
        var eLookup = {{}};
        eSet.forEach(function (v) {{ eLookup[v] = 1; }});
        mSet.forEach(function (v) {{ if (eLookup[v]) inter++; }});
        return unionCount > 0 ? inter / unionCount : 1.0;
    }}
    if (typeof ev === "object") {{
        if (typeof mv !== "object" || mv === null) return 0.0;
        var eKeys = Object.keys(ev);
        if (eKeys.length === 0) return Object.keys(mv).length === 0 ? 1.0 : 0.8;
        // Geometric mean matches the top-level value aggregation: every
        // key the GT provides is load-bearing. One wrong nested field
        // (e.g., address.city) should drop the nested value_score toward 0.
        var prod = 1.0;
        for (var k = 0; k < eKeys.length; k++) {{
            prod *= compareValue(mv[eKeys[k]], ev[eKeys[k]]);
            if (prod === 0) break;
        }}
        return Math.pow(prod, 1.0 / eKeys.length);
    }}
    var ms = canonicalize(mv);
    var es = canonicalize(ev);
    if (ms === es) return 1.0;
    if (!isNaN(Number(ms)) && !isNaN(Number(es)) && Number(ms) === Number(es)) return 1.0;
    if (typeof ms === "string" && typeof es === "string") {{
        var msN = ms.replace(/[\\s_-]/g, "");
        var esN = es.replace(/[\\s_-]/g, "");
        if (msN === esN) return 0.9;
    }}
    return 0.0;
}}

function canonicalize(v) {{
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim().toLowerCase();
    return String(v).toLowerCase();
}}

function parseToolCall(response) {{
    if (!response) return null;

    if (typeof response === "string") {{
        // Format 1: Qwen3.5 XML — <function=name><parameter=key>value</parameter></function>
        var xmlMatch = response.match(/<function=([^>]+)>(.*?)<\\/function>/s);
        if (xmlMatch) {{
            var fnName = xmlMatch[1];
            var paramBlock = xmlMatch[2];
            var args = {{}};
            var paramRegex = /<parameter=([^>]+)>([^<]*)<\\/parameter>/g;
            var m;
            while ((m = paramRegex.exec(paramBlock)) !== null) {{
                args[m[1]] = m[2];
            }}
            return {{ name: fnName, arguments: args }};
        }}

        // Format 1b: Partial/unclosed XML — `<function=name>` without `</function>`.
        // Base Qwen3.5-4B halts at the opening `<parameter=...>` tag for free-text
        // parameters (e.g. transfer_to_human_agents.summary) — it can't generate a
        // coherent multi-sentence summary from cold, so it stops after the param tag.
        // Without this path, parseToolCall returns null → grader returns FLOOR for
        // rows where the model DID correctly select the tool. FLOOR pins gradient
        // to zero and hides the tool-selection signal GRPO needs to amplify.
        // Recovering as {{name, arguments: any-closed-pairs}} yields a 0.4 score
        // (name_match × (0.4 + 0.6 × 0) = 0.4) — partial credit that matches how
        // native tool_calls with `arguments: {{}}` are already scored.
        var partialXmlMatch = response.match(/<function=([A-Za-z0-9_]+)>/);
        if (partialXmlMatch) {{
            var partialName = partialXmlMatch[1];
            var partialArgs = {{}};
            // Still try to extract any closed <parameter=k>v</parameter> pairs
            // that exist before the cutoff — e.g. if the model closed some simple
            // params before halting on a long one.
            var paramRegex2 = /<parameter=([^>]+)>([^<]*)<\\/parameter>/g;
            var pm;
            while ((pm = paramRegex2.exec(response)) !== null) {{
                partialArgs[pm[1]] = pm[2];
            }}
            return {{ name: partialName, arguments: partialArgs }};
        }}

        // Format 2: Hermes JSON — <tool_call>{{"name": ...}}</tool_call>
        var hermesMatch = response.match(/<tool_call>(.*?)<\\/tool_call>/s);
        if (hermesMatch) {{
            try {{
                var parsed = JSON.parse(hermesMatch[1]);
                return {{ name: parsed.name, arguments: parsed.arguments || {{}} }};
            }} catch (e) {{}}
        }}

        // Format 3: Raw JSON
        try {{
            var parsed = JSON.parse(response);
            if (parsed.name) return parsed;
            if (parsed.function) return {{ name: parsed.function.name, arguments: parsed.function.arguments }};
            if (parsed.tool_calls && parsed.tool_calls[0]) {{
                var tc = parsed.tool_calls[0];
                return {{ name: tc.function?.name || tc.name, arguments: tc.function?.arguments || tc.arguments }};
            }}
        }} catch (e) {{}}
    }}

    // Format 4: Object with tool_calls array. `arguments` follows OpenAI spec
    // and is a JSON STRING — parse it back into an object so downstream
    // `Object.keys(modelCall.arguments)` iterates real keys, not string
    // character indices. Missing this makes keyJaccard and valueScore collapse
    // to 0, pinning every row at `name_match × 0.4 = 0.4` even on exact-match
    // canonical responses (the v1/v2 bug).
    if (typeof response === "object") {{
        if (response.tool_calls && response.tool_calls[0]) {{
            var tc = response.tool_calls[0];
            var tcName = (tc.function && tc.function.name) || tc.name;
            var tcArgs = (tc.function && tc.function.arguments) !== undefined
                ? tc.function.arguments
                : tc.arguments;
            if (typeof tcArgs === "string") {{
                try {{ tcArgs = JSON.parse(tcArgs); }} catch (e) {{ tcArgs = {{}}; }}
            }}
            return {{ name: tcName, arguments: tcArgs || {{}} }};
        }}
        if (response.name) {{
            var nArgs = response.arguments;
            if (typeof nArgs === "string") {{
                try {{ nArgs = JSON.parse(nArgs); }} catch (e) {{ nArgs = {{}}; }}
            }}
            return {{ name: response.name, arguments: nArgs || {{}} }};
        }}
    }}

    return null;
}}
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a grader draft from trace analysis hints"
    )
    parser.add_argument(
        "--hints",
        required=True,
        help="Path to trace_grader_hints.json (from trace_analyze.py)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output path for grader-draft.js",
    )
    parser.add_argument(
        "--tools-file",
        help="Path to tool-schemas.json. When provided, generates a Jaccard-based "
             "tool-call grader instead of the text-match checklist grader.",
    )
    args = parser.parse_args()

    hints_path = Path(args.hints)
    if not hints_path.exists():
        print(f"Error: Hints file not found: {hints_path}", file=sys.stderr)
        sys.exit(1)

    hints = json.loads(hints_path.read_text())
    print(f"Loaded hints: {hints.get('dimension_count', 0)} dimensions, "
          f"{hints.get('calibration_pair_count', 0)} calibration pairs")

    # Auto-detect: tool-calling agent → Jaccard grader, text agent → checklist grader
    tool_schemas = None
    if args.tools_file:
        tools_path = Path(args.tools_file)
        if tools_path.exists():
            tools_data = json.loads(tools_path.read_text())
            tool_schemas = tools_data.get("tools", tools_data) if isinstance(tools_data, dict) else tools_data

    if tool_schemas:
        print(f"Tool-calling agent detected ({len(tool_schemas)} tools) — generating Jaccard grader")
        grader_js = generate_tool_call_grader_js(tool_schemas)
    else:
        print("Text-only agent — generating checklist grader")
        grader_js = generate_grader_js(hints)

    output_path = Path(args.output)
    output_path.write_text(grader_js)
    print(f"Written grader draft to {output_path}")

    # Summary
    dims = hints.get("dimensions", [])
    trace_count = sum(1 for d in dims if d.get("source") == "trace_failure")
    rule_count = sum(1 for d in dims if d.get("source") == "prompt_rule")
    print(f"  {trace_count} criteria from trace failures (Essential/Important)")
    print(f"  {rule_count} criteria from prompt rules (Important)")
    print(f"\n⚠ This is a DRAFT. Review and adjust before training.")


if __name__ == "__main__":
    main()
