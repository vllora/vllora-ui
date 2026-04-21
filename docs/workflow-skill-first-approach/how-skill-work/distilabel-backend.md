# Distilabel Backend Architecture

This document explains how the `distilabel` Step 4 backend fits into the skill-first workflow without changing gateway APIs, Lucy UI behavior, or downstream Steps 5-8.

## Why It Lives Inside the Skill

The distilabel integration is skill-local because it is a data-generation strategy, not a new platform primitive.

That means:

- the gateway upload APIs stay unchanged
- Lucy continues to visualize the same workflow artifacts
- `training.jsonl` stays the authoritative dataset boundary
- backend-specific intermediates stay inside `finetune-project/distilabel/`

## Backend Resolution

Step 4 resolves the backend in this order:

1. `config.json.generation_backend`
2. legacy `config.json.use_nemo`
3. fallback to `native`

Supported values:

- `native`
- `distilabel`
- `nemo`

## Artifact Reuse

The distilabel backend consumes the same artifacts the native flow already produces:

- `topics.json`
- `relations.json`
- `knowledge/*/knowledge_parts.json`
- `knowledge/all-parts-index.json`
- `trace-analysis/priority.json`
- `trace-analysis/prompts.json`
- `trace-analysis/decision-points.jsonl`
- `trace-analysis/tool-schemas.json`

It does not create new upstream prerequisites.

## Text-Only Flow

Text mode uses two paper-derived methods in a bounded way:

1. Instruction Backtranslation generates candidate prompts from grounded source chunks
2. DEITA-inspired scoring and filtering selects the final per-topic set

Why this split:

- Backtranslation is useful for candidate generation from existing knowledge artifacts
- DEITA is useful as a selector and diversity filter
- keeping them separate preserves inspectable intermediate artifacts and keeps the downstream dataset contract simple

Text intermediates:

- `distilabel/text-candidates.jsonl`
- `distilabel/text-selected.jsonl`
- `distilabel/text-selection-report.json`
- `distilabel/pipeline-metadata.json`

## Combined PDF + Trace Flow

When trace artifacts exist, distilabel consumes them the same way the native backend does:

- `priority.json` biases per-topic allocation within a capped `3:1` ratio
- `prompts.json.seed_queries` injects real user phrasing as candidate seeds
- `prompts.json.system_prompt` can provide the root prompt if the operator does not pass one directly

This keeps the combined-mode curriculum trace-informed without creating a separate UI or gateway concept for distilabel.

## Tool-Calling Flow

Tool-calling is different: the canonical dataset already exists in `trace-analysis/decision-points.jsonl`.

For that reason, APIGen is augmentation-only:

- canonical decision-point rows remain the base dataset
- APIGen is used only to add missing coverage for underrepresented tool topics
- merged output preserves existing multi-turn messages, tool schemas, and structured ground-truth shape

Why APIGen is not the canonical generator:

- the trace-derived rows already encode the highest-fidelity training signal
- replacing them would introduce avoidable distribution shift
- augmentation is the lowest-risk way to increase rare-topic coverage

Tool intermediates:

- `distilabel/apigen-candidates.jsonl`
- `distilabel/apigen-selected.jsonl`
- `distilabel/apigen-merge-report.json`

## Safety Constraints

The distilabel backend is intentionally constrained:

- canonical decision-point rows must survive byte-for-byte unchanged
- DEITA is selector-only, not a generator
- APIGen is augmenter-only, not a replacement for the canonical trace dataset
- downstream validators and upload tooling must continue to work without knowing anything about distilabel

Optional metadata such as `metadata.distilabel.*` is allowed, but downstream tools must treat it as ignorable.

## Why This Fits the Existing UI

The UI already understands:

- workflow artifacts
- topics
- relations
- records
- trace analysis

Because distilabel writes back into the same `training.jsonl` boundary and keeps its intermediates local, the UI only needs documentation updates, not product changes.
