# Lucy Skills Approach - Design Document

## Status: Draft / Proposal

This document proposes an alternative (or complementary) approach to the current finetune pipeline. Instead of training custom model weights, the system generates **Skill Packages** — structured knowledge, prompts, examples, and tools — that augment a foundation model (Claude, GPT-4, etc.) at inference time.

---

## Problem Statement

The current finetune pipeline produces models that underperform as specialist agents. Root causes:

1. **Lossy knowledge compression**: Knowledge sources → synthetic data → small model weights (4x lossy transformation)
2. **Small model capacity limits**: LoRA rank 8 on Qwen3-4B cannot absorb deep domain knowledge
3. **Synthetic data quality ceiling**: LLM-generated training data captures surface patterns, not domain expertise
4. **Grader calibration issues**: LLM-as-judge struggles to distinguish correct domain answers from confident hallucinations
5. **No runtime knowledge access**: The finetuned model has zero access to source material at inference time

## Proposed Solution

Generate a **Skill Package** that a foundation model loads at inference time, becoming a domain specialist through context augmentation rather than weight modification.

```
Current:  Knowledge → Synthetic Data → Train Weights → Specialist (lossy, slow)
Proposed: Knowledge → Skill Package → Foundation Model + Context → Specialist (lossless, fast)
```

---

## Document Index

| Document | What it covers |
|----------|---------------|
| [Analysis](./analysis.md) | Deep comparison of Finetune vs Skills approaches, quality bottleneck breakdown |
| [Architecture](./architecture.md) | Technical architecture, skill package spec, system design |
| [Pipeline](./pipeline.md) | Step-by-step skill generation pipeline, reuse of existing infrastructure |
| [Expected Output](./expected-output.md) | What the user gets: 3 core outputs, JSONL dataset, deployment options |
| [Evaluation](./evaluation.md) | How we prove the skill works: delta testing, grounding checks, ablation |
| [Research](./research.md) | Prior art, academic papers, industry products validating this approach |
| [Migration Strategy](./migration-strategy.md) | How to evolve from current finetune-only to Skills + optional Finetune |

---

## Key Concept: What is a Skill?

A Skill Package is a deployable artifact that contains everything a foundation model needs to become a domain specialist:

```
Skill Package
├── system_prompt.md              # Expert persona, behavioral rules, domain context
├── knowledge_index/              # Retrievable, structured knowledge chunks
│   ├── chunks.json               # Indexed content from user's reference docs
│   └── embeddings.json           # Semantic search embeddings
├── few_shot_examples/            # Curated high-quality examples (graded, filtered)
│   ├── by_topic/                 # Organized by topic hierarchy
│   └── by_difficulty/            # Easy / medium / hard
├── reasoning_templates/          # Domain-specific reasoning patterns
│   ├── common_scenarios.md       # How to approach typical questions
│   └── edge_cases.md             # Known tricky cases + how to handle
├── tools/                        # Domain-specific tool definitions
│   └── domain_tools.json         # Callable functions for the domain
├── evaluation_rubric.md          # Self-check criteria (reuse from grader)
└── manifest.json                 # Metadata, versioning, compatibility
```

## Why This Works

| Factor | Finetune | Skills |
|--------|----------|--------|
| Knowledge access at inference | None (must memorize) | Direct (RAG retrieval) |
| Reasoning capability | Bounded by small model | Full foundation model |
| Iteration speed | Hours/days | Minutes |
| Knowledge updates | Retrain from scratch | Edit a file |
| Hallucination risk | High (no source to verify) | Lower (can cite sources) |
| Quality ceiling | Low-Medium | High |

## Relationship to Current Pipeline

This is **not a replacement** for the finetune pipeline — it's an alternative output mode that reuses ~70% of existing infrastructure. The proposed architecture supports both:

```
User Objective + Knowledge Sources
         │
    ┌────┴────┐
    ▼         ▼
 Skills    Finetune (optional)
 Package   ← can use skill-augmented
 (fast)      model for better training data
```

See [Migration Strategy](./migration-strategy.md) for the incremental adoption plan.
