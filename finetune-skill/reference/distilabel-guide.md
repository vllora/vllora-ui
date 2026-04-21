# Distilabel Backend Guide

This guide covers the skill-local `distilabel` Step 4 backend. It is a third generation backend beside the native `generate_records.py` path and the optional NeMo path.

## Overview

`distilabel` is useful when you want a paper-derived data generation and selection pipeline while still reusing the existing finetune skill artifacts and downstream validation flow.

Backend resolution:

- If `config.json` contains `generation_backend`, that value wins
- Else if `use_nemo: true`, the backend resolves to `nemo`
- Else the backend resolves to `native`

Supported v1 recipes:

- Text-only: `instruction_backtranslation_deita`
- Tool-calling augmentation: `apigen`

## What It Reuses

The backend does not introduce new upstream prerequisites. It consumes the same artifacts the skill already produces:

- `topics.json`
- `relations.json`
- `knowledge/*/knowledge_parts.json`
- `knowledge/all-parts-index.json`
- `trace-analysis/priority.json` when present
- `trace-analysis/prompts.json` when present
- `trace-analysis/decision-points.jsonl` for tool-calling
- `trace-analysis/tool-schemas.json` for tool-calling
- `config.json`

The authoritative downstream output is still:

- `finetune-project/training.jsonl`

Steps 5-8 remain unchanged.

## Output Layout

Distilabel writes intermediates under `finetune-project/distilabel/`:

- `text-candidates.jsonl`
- `text-selected.jsonl`
- `text-selection-report.json`
- `apigen-candidates.jsonl`
- `apigen-selected.jsonl`
- `apigen-merge-report.json`
- `pipeline-metadata.json`

These files are optional inspection artifacts. Downstream scripts should continue to read `training.jsonl`.

## Configuration

```json
{
  "generation_backend": "distilabel",
  "distilabel": {
    "model": "gpt-4o-mini",
    "base_url": "http://localhost:9090/v1",
    "keep_intermediate": true,
    "text_recipe": "instruction_backtranslation_deita",
    "tool_recipe": "apigen",
    "apigen_tool_module": null,
    "min_records_per_topic": 25,
    "target_records_per_topic": 30
  }
}
```

Defaults:

- `model`: `gpt-4o-mini`
- `base_url`: `http://localhost:9090/v1`
- `keep_intermediate`: `true`
- `text_recipe`: `instruction_backtranslation_deita`
- `tool_recipe`: `apigen`
- `apigen_tool_module`: `null`
- `min_records_per_topic`: `25`
- `target_records_per_topic`: `30`

## Dependency Setup

Install distilabel only when you intend to use this backend:

```bash
pip install "distilabel>=1.5"
```

The scripts continue to run via `uv run`. Each script declares its own direct dependencies with PEP 723 headers.

## Text Backend

Text mode runs two stages:

1. `run_distilabel_text_backend.py`
2. `apply_deita_selection.py`

Flow:

1. Resolve leaf topics from `topics.json`
2. Reuse `relations.json` to find source chunks
3. Reuse the existing composed system prompt logic
4. Generate candidate prompts with Instruction Backtranslation
5. Score and select candidates with DEITA-inspired heuristics
6. Write the selected rows to `training.jsonl`
7. Run the normal post-processing chain: dedupe, validate, quality gate

Combined mode behavior:

- `trace-analysis/priority.json` upweights high-failure topics within a capped `3:1` ratio
- `trace-analysis/prompts.json.seed_queries` injects real user phrasing as seed candidates
- `trace-analysis/prompts.json.system_prompt` can provide the root prompt if you do not pass one explicitly

Record conventions:

- `prompt_type: "backtranslation"`
- `metadata.distilabel.method = "instruction_backtranslation"`
- `metadata.distilabel.candidate_score`
- `metadata.distilabel.selection_reason`

## Tool-Calling Backend

Tool-calling mode is augmentation-only.

Canonical base dataset:

- `trace-analysis/decision-points.jsonl`

APIGen responsibilities:

- detect underrepresented tool topics
- generate additional rare-topic and edge-case examples
- preserve the existing `tools` array and structured `{name, arguments}` ground truth
- merge new rows with the canonical base without rewriting canonical rows

Hard safety rules:

- canonical decision-point rows survive byte-for-byte unchanged
- multi-turn trace records are never flattened to text-only prompts
- structured tool `ground_truth` is never stringified
- APIGen adds rows; it does not replace the base dataset

Execution checking:

- semantic checking always runs
- execution checking runs only when `distilabel.apigen_tool_module` points to a local Python module with callable tool implementations

Record conventions:

- `prompt_type: "apigen"`
- `metadata.distilabel.method = "apigen"`
- `metadata.distilabel.source_record_id`

## Paper Mapping

This implementation uses the following methods in bounded ways:

| Method | Used for | Not used for |
|------|------|------|
| Instruction Backtranslation | Generate grounded text-only candidate prompts from existing knowledge chunks | General-purpose synthetic answer generation |
| DEITA | Score, diversity-filter, and budget-select text candidates | Candidate generation |
| APIGen | Generate additional tool-calling augmentation records around underrepresented topics | Replacing canonical trace decision points |

Future-only, documented but not implemented:

- Prometheus 2
- UltraFeedback
- CLAIR
- Math Shepherd
- DeepSeek Prover

## When To Use Which Backend

| Backend | Best fit | Tradeoff |
|------|------|------|
| `native` | Small-to-medium text datasets, no extra dependency, direct `relations.json` driven generation | Simpler heuristics, fewer intermediate inspection artifacts |
| `distilabel` | You want candidate generation plus explicit filtering/selection, or tool-calling augmentation around canonical traces | Requires optional distilabel install |
| `nemo` | You want retrieval-backed NeMo recipes, judge columns, and NeMo Data Designer workflow | Requires separate NeMo server and extra infrastructure |

## Failure Modes

Common setup failures:

- Distilabel missing: install it before selecting `generation_backend: "distilabel"`
- Unsupported recipe value: only the v1 recipe names above are accepted
- Missing root system prompt in text mode: pass `--system-prompt` or provide `trace-analysis/prompts.json`
- Missing `decision-points.jsonl` or `tool-schemas.json` in tool-calling mode: APIGen cannot run without the canonical trace artifacts
- Missing `apigen_tool_module`: execution checking is skipped intentionally and reported as such

## Recommended Step 4 Commands

Text-only:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/run_distilabel_text_backend.py \
  --project-dir finetune-project \
  --system-prompt "$ROOT_SYSTEM_PROMPT"

uv run ${CLAUDE_SKILL_DIR}/scripts/apply_deita_selection.py \
  --project-dir finetune-project \
  --final-output finetune-project/training.jsonl
```

Tool-calling augmentation:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/run_distilabel_apigen_backend.py \
  --project-dir finetune-project \
  --output finetune-project/training.jsonl
```

Then continue with the usual chain:

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/deduplicate_records.py finetune-project/training.jsonl
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py finetune-project/training.jsonl --topics finetune-project/topics.json
uv run ${CLAUDE_SKILL_DIR}/scripts/data_quality_gate.py finetune-project/training.jsonl --topics finetune-project/topics.json --all-gates --sample 30
```
