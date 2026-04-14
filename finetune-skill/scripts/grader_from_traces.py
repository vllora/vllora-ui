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
    args = parser.parse_args()

    hints_path = Path(args.hints)
    if not hints_path.exists():
        print(f"Error: Hints file not found: {hints_path}", file=sys.stderr)
        sys.exit(1)

    hints = json.loads(hints_path.read_text())
    print(f"Loaded hints: {hints.get('dimension_count', 0)} dimensions, "
          f"{hints.get('calibration_pair_count', 0)} calibration pairs")

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
