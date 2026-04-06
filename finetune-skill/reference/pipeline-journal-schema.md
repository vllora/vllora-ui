# Pipeline Journal Schema (`pipeline-journal.json`)

A structured JSON log of every decision, analysis, and job in the finetune pipeline. Unlike `execution-log.md` (human-readable narrative) and `iterations.json` (eval/training metrics), the pipeline journal captures the **reasoning chain** — why each job was created, what analysis triggered it, and what was found.

The UI can use this to show the sequence of agent decisions alongside jobs, so users understand why eval-003 exists (because eval-002 showed a grader exploit) or why training switched from 4B to 0.8B (because headroom gate failed).

## Schema

```json
{
  "version": "1.0",
  "workflow_id": "uuid",
  "objective": "short objective description",
  "entries": [
    {
      "id": 1,
      "timestamp": "2026-04-04T16:20:00Z",
      "step": "step_1_objective",
      "action": "define_objective",
      "status": "completed",
      "summary": "Defined objective: identify Big 9 allergens from ingredient lists, including hidden sources",
      "details": {
        "output_format": "comma-separated allergen names or 'none'",
        "source_documents": ["FDA-Allergen-Labeling-FALCPA.pdf"],
        "num_documents": 1
      },
      "decision": "Proceed to document extraction",
      "triggers_next": 2
    },
    {
      "id": 2,
      "timestamp": "2026-04-04T16:25:00Z",
      "step": "step_2_extraction",
      "action": "extract_documents",
      "status": "completed",
      "summary": "Extracted 68 knowledge parts from FDA FALCPA guide (75 Docling chunks → 67 text + 1 table)",
      "details": {
        "documents": [
          {
            "name": "fda-allergen-labeling-falcpa",
            "pages": 24,
            "docling_chunks": 75,
            "knowledge_parts": 68,
            "text_parts": 67,
            "table_parts": 1,
            "reused_existing": false,
            "extraction_issues": null
          }
        ],
        "total_parts": 68,
        "gateway_verified": true
      },
      "analysis": "68 parts covering allergen definitions, labeling requirements, exemptions, hidden sources, FASTER Act (sesame). Good coverage of Big 9.",
      "decision": "Proceed to topic hierarchy",
      "triggered_by": 1,
      "triggers_next": 3
    },
    {
      "id": 3,
      "timestamp": "2026-04-04T16:30:00Z",
      "step": "step_3_topics",
      "action": "build_topics",
      "status": "completed",
      "summary": "Built 17 topics (14 leaf) covering hidden sources per allergen + explicit + complex scenarios",
      "details": {
        "total_parts": 68,
        "relevant_parts": 54,
        "excluded_parts": 14,
        "excluded_samples": ["Nonbinding Recommendations (boilerplate)", "Pet foods/animal feeds"],
        "topic_count": 17,
        "leaf_topics": 14,
        "difficulty_breakdown": {"easy": 3, "medium": 6, "hard": 5},
        "relations": 82,
        "topics": ["hidden-milk", "hidden-egg", "hidden-wheat", "hidden-soy", "hidden-sesame", "hidden-tree-nuts", "hidden-fish", "hidden-shellfish", "hidden-peanut", "explicit-single", "explicit-multiple", "explicit-none", "complex-mixed-hidden", "complex-confusing"]
      },
      "analysis": "14 leaf topics: 9 hidden-source topics (one per allergen) + 3 explicit + 2 complex. 14 parts excluded as irrelevant. System prompt self-check passed.",
      "decision": "Proceed to record generation",
      "triggered_by": 2,
      "triggers_next": 4
    },
    {
      "id": 4,
      "timestamp": "2026-04-04T16:35:00Z",
      "step": "step_4_records",
      "action": "generate_records",
      "status": "completed",
      "summary": "Generated 280 records (20 per topic), 0 duplicates removed",
      "details": {
        "mode": "relations",
        "records_per_topic": 20,
        "total_generated": 280,
        "dedup_removed": 0,
        "uploaded": 280,
        "per_topic_counts": {"hidden-milk": 20, "hidden-egg": 20, "explicit-none": 20},
        "source_parts_coverage": "per-record tagging via --enrich-sources",
        "gt_format_fixes": 11,
        "data_quality_notes": "33 records in hidden-* topics have GT='none' (about exemptions, not detection)"
      },
      "analysis": "280 records balanced across 14 topics. 33 records may be conversational format rather than ingredient lists — will monitor in eval.",
      "decision": "Proceed to grader writing",
      "triggered_by": 3,
      "triggers_next": 5
    },
    {
      "id": 5,
      "timestamp": "2026-04-04T16:40:00Z",
      "step": "step_5_grader",
      "action": "write_grader",
      "status": "completed",
      "summary": "Created multi-label grader using grader-multilabel.js template with F0.5 scoring",
      "details": {
        "template": "grader-multilabel.js",
        "template_reason": "Multi-label set comparison task — model outputs set of allergen names",
        "scoring": "F-beta (β=0.5, precision-heavy — false positives are safety-critical for allergens)",
        "criteria": ["F0.5 set comparison", "precision floor (0.67)", "per-FP penalty (0.15)", "brevity bonus"],
        "dry_run_test1": {"perfect_match": 1.0, "partial": 0.74, "false_pos": 0.14, "over_predict": 0.02},
        "dry_run_test2_live": [1.0, 0.02, 0.74],
        "grader_chars": 13251,
        "gateway_verified": true
      },
      "analysis": "F0.5 scoring prevents the over-prediction exploit (MO-GRPO arXiv:2509.22047). Dry-run shows good score spread. Precision floor caps over-predicting completions at 0.40.",
      "decision": "Proceed to data quality gate + eval",
      "triggered_by": 4,
      "triggers_next": 6
    },
    {
      "id": 6,
      "timestamp": "2026-04-04T16:42:00Z",
      "step": "step_5_5_quality_gate",
      "action": "data_quality_gate",
      "status": "completed",
      "summary": "Data quality gate: WARN (short GTs expected for terse output task)",
      "details": {
        "structural": "PASS (280 records, 280 unique IDs, 14 topics, balanced)",
        "diversity": "PASS (0.856 avg distance, 0 near-dupes)",
        "completion_length": "PASS (recommended_min=15 tokens)",
        "max_output_tokens_decision": 128
      },
      "analysis": "All hard checks pass. Short GT warning is expected — allergen labels are 1-10 tokens.",
      "decision": "Proceed to initial eval",
      "triggered_by": 5,
      "triggers_next": 7
    },
    {
      "id": 7,
      "timestamp": "2026-04-04T16:50:00Z",
      "step": "step_7_eval",
      "action": "create_eval",
      "status": "completed",
      "summary": "GPT-4o-mini baseline eval — validate data quality and grader",
      "reason_created": "Initial eval to validate data quality and grader before testing base model",
      "job_id": "eval-run-uuid",
      "job_type": "eval",
      "model": "gpt-4o-mini",
      "results": {
        "avg_score": 0.598,
        "perfect_rate": 0.55,
        "zero_rate": 0.0,
        "per_topic_weakest": ["hidden-sesame=0.37", "hidden-tree-nuts=0.41"]
      },
      "analysis": "55% perfect rate, 37% dead-weight records. Dead records are conversational questions, not ingredient lists — model answers 'none' because the question doesn't present ingredients.",
      "decision": "Fix data: remove 104 dead-weight records, regenerate with ingredient-list format",
      "triggers_next": 8
    },
    {
      "id": 8,
      "timestamp": "2026-04-04T17:00:00Z",
      "step": "step_9_iteration",
      "action": "fix_records",
      "status": "completed",
      "summary": "Removed 104 dead-weight records, regenerated 210 ingredient-list format replacements",
      "reason_created": "Eval #7 showed 37% dead-weight records — conversational questions where model answers 'none' because no ingredients are presented. These records provide zero GRPO gradient.",
      "details": {
        "removed": 104,
        "removal_reason": "Records scored <0.05 because they ask about allergen labeling process, not actual ingredient analysis",
        "generated": 210,
        "generation_approach": "Ingredient-list format prompts: 'Given these ingredients: [X, Y, Z], identify all allergens'",
        "total_after": 384,
        "dedup_removed": 2,
        "fix_type": "records"
      },
      "analysis": "Replaced conversational prompts with ingredient-list prompts. New records target the same knowledge parts but in a format the model must actually analyze.",
      "decision": "Re-eval with fixed data to verify improvement",
      "triggered_by": 7,
      "triggers_next": 9
    },
    {
      "id": 9,
      "timestamp": "2026-04-04T17:10:00Z",
      "step": "step_7_eval",
      "action": "create_eval",
      "status": "completed",
      "summary": "GPT-4o-mini eval on fixed data — verify record fix worked",
      "reason_created": "Re-eval after removing 104 dead-weight records and regenerating 210 ingredient-list replacements",
      "job_id": "eval-run-uuid-2",
      "job_type": "eval",
      "model": "gpt-4o-mini",
      "results": {
        "avg_score": 0.879,
        "perfect_rate": 0.73,
        "zero_rate": 0.0
      },
      "analysis": "avg improved 0.598→0.879. Dead-weight dropped from 37% to <1%. Readiness gate PASS. Data fix worked.",
      "decision": "Proceed to base model eval (Step 7d) — check GRPO headroom",
      "triggered_by": 8,
      "triggers_next": 10
    },
    {
      "id": 10,
      "timestamp": "2026-04-04T17:20:00Z",
      "step": "step_7d_headroom",
      "action": "create_eval",
      "status": "completed",
      "summary": "Qwen3.5-4B baseline eval — headroom check",
      "reason_created": "Step 7d: must evaluate base model before training to check GRPO headroom. Default to 4B first.",
      "job_id": "eval-run-uuid-3",
      "job_type": "eval",
      "model": "Qwen3.5-4B",
      "results": {
        "avg_score": 0.828,
        "perfect_rate": 0.69,
        "zero_rate": 0.0,
        "per_topic_weakest": ["complex-confusing=0.695", "hidden-fish=0.737"]
      },
      "analysis": "4B scores 0.828 (>0.75) — HEADROOM GATE FAILS. 69% of records are already perfect. GRPO will have insufficient gradient signal on 4B.",
      "decision": "Headroom gate failed. Follow diagnostic tree: eval 0.8B to distinguish 'model genuinely good' from 'records too easy'.",
      "triggered_by": 9,
      "triggers_next": 11
    },
    {
      "id": 11,
      "timestamp": "2026-04-04T17:30:00Z",
      "step": "step_7d_headroom",
      "action": "create_eval",
      "status": "completed",
      "summary": "Qwen3.5-0.8B eval — headroom diagnostic (is 4B too good, or are records too easy?)",
      "reason_created": "4B scored 0.828 (>0.75). Diagnostic tree Step B: eval 0.8B on same records. If 0.8B also scores >0.75 → records too easy. If 0.8B scores 0.10-0.75 → model genuinely good, train 0.8B.",
      "job_id": "eval-run-uuid-4",
      "job_type": "eval",
      "model": "Qwen3.5-0.8B",
      "results": {
        "avg_score": 0.540,
        "perfect_rate": 0.39,
        "zero_rate": 0.005,
        "per_topic_weakest": ["hidden-wheat=0.35", "hidden-egg=0.38", "hidden-fish=0.44"]
      },
      "analysis": "0.8B scores 0.540 (much lower than 4B's 0.828) — diagnosis: MODEL genuinely good, NOT records too easy. 0.8B has ideal GRPO headroom (0.10-0.75). Hidden-source topics are the weakest — exactly what GRPO should teach.",
      "decision": "Train Qwen3.5-0.8B. Chosen because: 4B has insufficient headroom (0.828), 0.8B has ideal headroom (0.540), hidden-source topics have most room to improve.",
      "triggered_by": 10,
      "triggers_next": 12
    },
    {
      "id": 12,
      "timestamp": "2026-04-04T17:45:00Z",
      "step": "step_7e_training",
      "action": "create_training",
      "status": "completed",
      "summary": "GRPO training on Qwen3.5-0.8B — 5 epochs, K=8",
      "reason_created": "0.8B eval showed ideal headroom (0.540). Readiness gate passed. Source-part coverage audit found no Type B gaps. Proceeding to training.",
      "job_id": "training-job-uuid",
      "job_type": "training",
      "model": "Qwen3.5-0.8B",
      "config": {
        "epochs": 5,
        "learning_rate": 5e-6,
        "K": 8,
        "max_output_tokens": 64
      },
      "constraints": {"max_cost_usd": 2.00, "max_duration_minutes": 60},
      "results": {
        "final_avg": 0.918,
        "baseline_avg": 0.540,
        "improvement": 0.378,
        "best_epoch": 4,
        "epoch_progression": [
          {"epoch": 0, "avg": 0.647, "perfect_rate": 0.47},
          {"epoch": 1, "avg": 0.790, "perfect_rate": 0.62},
          {"epoch": 2, "avg": 0.845, "perfect_rate": 0.69},
          {"epoch": 3, "avg": 0.865, "perfect_rate": 0.72},
          {"epoch": 4, "avg": 0.870, "perfect_rate": 0.73}
        ]
      },
      "analysis": "0.8B trained model (0.918 best-of-K) surpasses untrained 4B (0.828) by +0.090. Hidden allergen detection improved +0.43 to +0.61 per topic. Weakest: complex-confusing (0.767). Over-prediction detected in 18 records (grader FP exploit) — fixable with F0.5 scoring.",
      "decision": "Training succeeded. Deploy trained 0.8B model. Next iteration: tighten FP penalty for complex-confusing topic.",
      "triggered_by": 11
    }
  ]
}
```

## Key Fields

| Field | Purpose | UI usage |
|-------|---------|----------|
| `id` | Sequential entry number | Timeline ordering |
| `reason_created` | **Why this job/action exists** — the reasoning chain | Show next to job in UI: "Created because..." |
| `analysis` | What the agent found after the job completed | Show as expandable detail |
| `decision` | What the agent decided to do next | Show as the link between entries |
| `triggered_by` | Which previous entry caused this one | Draw arrows in timeline view |
| `triggers_next` | Which next entry this leads to | Draw arrows in timeline view |
| `job_id` | Links to the actual eval/training job | Click to view job details |
| `job_type` | "eval" or "training" | Icon/color in UI |

## Entry Types

| `action` value | When used | Key `details` fields |
|---------------|-----------|---------------------|
| `define_objective` | Step 1 — user objective | `output_format`, `source_documents` |
| `extract_documents` | Step 2 — document extraction | Per-doc: `pages`, `docling_chunks`, `knowledge_parts`, `extraction_issues` |
| `build_topics` | Step 3 — topic hierarchy | `relevant_parts`, `excluded_parts`, `topic_count`, `difficulty_breakdown`, `topics` list |
| `generate_records` | Step 4 — training data | `mode`, `records_per_topic`, `dedup_removed`, `per_topic_counts`, `data_quality_notes` |
| `write_grader` | Step 5 — grader creation | `template` used + `template_reason`, `scoring` method, `criteria` list |
| `dry_run_grader` | Step 5.1 — grader validation | Test 1 (hand-crafted scores), Test 2 (live model scores), Test 3 (adversarial checks). Score distribution spread. |
| `data_quality_gate` | Step 5.5 — quality checks | Per-gate results: `structural`, `diversity`, `completion_length` |
| `create_eval` | Step 7 — any evaluation job | `job_id`, `model`, `results` (avg, perfect_rate, per_topic_weakest) |
| `readiness_gate` | Step 7c — readiness check | Hard/soft check results, difficulty probe, `trivial_frac`, `learnable_frac`, `dead_frac`, `per_topic` breakdown |
| `estimate_training` | Step 7b+ — cost/duration estimate | `models` compared, `constraints` from config.json, `viable_models` (models within limits), per-model `estimated_cost_usd` and `estimated_duration_seconds` |
| `headroom_diagnostic` | Step 7d — model selection | `base_model_score`, `gate_result`, `diagnostic_branch`, `chosen_model` |
| `coverage_audit` | Step 7d — source-part coverage | `total_parts`, `easy_only_parts`, `type_b_gaps`, `new_records_generated` |
| `create_training` | Step 7e — training job | `job_id`, `model`, `config` (epochs, lr, K, max_output_tokens), `constraints` (from config.json, if present) |
| `training_monitoring` | Step 7e — epoch updates | `progression_table`, `trigger_checks`, `per_record_inspection`, `epoch_progression` array |
| `post_training_eval` | Step 8b — eval on trained model | `trained_model`, `trained_score`, `baseline_score`, `improvement` |
| `training_analysis` | Step 8c — post-training analysis | `per_topic_comparison`, `improved_records`, `degraded_records` |
| `fix_grader` | Step 9a — grader iteration | `what_changed`, `why`, `dry_run_before_after` |
| `fix_records` | Step 9a — record iteration | `removed`, `generated`, `total_after`, `fix_reason` |
| `fix_both` | Step 9a — grader + records | Combined details |

## How the Agent Writes It

The agent appends a new entry to `pipeline-journal.json` at the same time it writes to `execution-log.md`. The journal is structured data; the log is human narrative. Both are written at the same two points: when a step starts (status="in_progress") and when it completes (status="completed").

```python
import json
from pathlib import Path

journal_file = Path("finetune-project/pipeline-journal.json")
if journal_file.exists():
    journal = json.loads(journal_file.read_text())
else:
    journal = {"version": "1.0", "workflow_id": "WF_ID", "entries": []}

next_id = max((e["id"] for e in journal["entries"]), default=0) + 1
journal["entries"].append({
    "id": next_id,
    "timestamp": "2026-04-04T16:30:00Z",
    "step": "step_7_eval",
    "action": "create_eval",
    "status": "completed",
    "summary": "...",
    "reason_created": "WHY this job was created",
    "job_id": "eval-uuid",
    "job_type": "eval",
    "model": "gpt-4o-mini",
    "results": {...},
    "analysis": "What was found",
    "decision": "What to do next",
    "triggered_by": previous_entry_id,
    "triggers_next": null  # filled in when next entry is created
})
journal_file.write_text(json.dumps(journal, indent=2))
```
