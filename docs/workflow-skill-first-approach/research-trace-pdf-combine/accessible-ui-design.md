# Design Doc: Making the Pipeline UI Accessible to Non-Experts

> **Date**: 2026-04-14
> **Status**: Research complete, design principles ready
> **Problem**: The current UI is built for ML engineers. A product manager, domain expert, or customer success lead can't understand what's happening or what action to take.

## The Core Problem

The current UI shows:
```
learnable: 34% | trivial: 49% | hard: 17%
```

A non-expert thinks: "What does any of this mean? Is 34% good or bad? What should I do?"

The UI should show:
```
Your model already knows 49% of these answers.
It can learn 34% more — that's enough to start training.
17% are too hard for now — that's normal.

[Start Training]  or  [Improve your examples first]
```

## Research Findings

### What works (from platforms that solved this)

| Platform | Approach | Key insight |
|---|---|---|
| **OpenAI Fine-tuning** | Hide everything, show progress bar + "lower is better" | Remove decisions rather than explain them |
| **Apple CreateML** | Drag-and-drop, single accuracy % with green/yellow/red | One metric, one color, no jargon |
| **Obviously AI** | Natural language input, plain-English results | "Customers who haven't logged in for 30 days are 4x more likely to churn" |
| **Lobe.ai** | Three steps: Label → Train → Use. Live preview to test. | No metrics during training — just "try it and see" |
| **Stripe** | Short bold explanation + why it matters + "Learn more" | Contextual education at point of need |

### The right pattern: Wizard + Narrative

For a multi-step pipeline with analysis:
- **Wizard** for the process (clear sequence, what to do next)
- **Narrative** for the results (sentences, not numbers)
- **Progressive disclosure** for power users (toggle to see technical details)

## Three Design Principles

### 1. Every metric becomes a sentence with "so what"

| Current (technical) | Accessible (plain language) |
|---|---|
| `learnable: 34%` | "Your model can improve on 34% of examples — that's enough to start training" |
| `failure_rate: 42%` | "Users struggled with exchanges 42% of the time — we're focusing training here" |
| `priority_score: 0.0848` | "#1 priority" or just show as ranking, not raw number |
| `length_drift_risk` | "Responses may be getting longer than needed" (yellow warning) |
| `seed_queries: 76` | "76 example questions from real customer conversations" |
| `GRPO` | Never mention. Just "training" |
| `grader` | "Quality checker" or "Scoring rules" |
| `topics` | "Skills your model is learning" |
| `evaluation` | "Test run" or "Practice test" |
| `knowledge sources` | "Source materials" or "Training documents" |
| `records` | "Teaching examples" or "Practice questions" |

### 2. Every step has a "What to do next" action

After each pipeline step, show a banner:

```
After extraction:
  "We found 8 sections in your policy document.
   We also analyzed 460 real customer conversations — exchanges and returns
   are where customers struggle most.
   [Continue to Generate Training Data]"

After evaluation:
  "Your model scored 43% on average — there's good room to improve.
   34% of examples are in the 'learnable zone' where training works best.
   [Start Training]  [Improve examples first]"

After training fails:
  "Training stopped because responses were getting too long.
   We've adjusted the settings.
   [Retry Training]  [Ask for help]"
```

### 3. Default view is actionable without technical knowledge

Two layers via progressive disclosure:

```
┌─────────────────────────────────────────────────────────┐
│  DEFAULT VIEW (everyone sees this)                       │
│                                                          │
│  Your model is learning 12 skills from a retail          │
│  customer service policy + 460 real conversations.       │
│                                                          │
│  ■■■■■■■■░░ 80% complete                                │
│                                                          │
│  Current: Training your model (estimated 70 min)         │
│  Next: Test the trained model                            │
│                                                          │
│  [Show technical details ▸]                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  TECHNICAL DETAILS (power users click to expand)         │
│                                                          │
│  Model: Qwen3.5-0.8B                                    │
│  Records: 401 (76 from real traces, 325 synthetic)      │
│  Allocation: trace-weighted (priority_score)             │
│  Grader: checklist rubric, 34 criteria                   │
│  Eval: avg=0.43, learnable=34%, std=0.31                 │
│  Training: epochs=5, lr=5e-6, K=16, max_tokens=128      │
└─────────────────────────────────────────────────────────┘
```

## Jargon Translation Reference

### Sidebar sections
| Current | Accessible |
|---|---|
| SOURCE DOCUMENTS | SOURCE MATERIALS |
| TRAINING DATA | TEACHING EXAMPLES |
| EVALUATOR | QUALITY CHECKER |
| EVAL RUNS | TEST RUNS |
| TRAINING JOBS | TRAINING |
| PIPELINE JOURNAL | ACTIVITY LOG |

### Status messages
| Current | Accessible |
|---|---|
| "Readiness: FAIL, length_drift_risk" | "Not ready yet — responses are getting too long. Fixing automatically." |
| "401 records, 12 topics, 76 seeds (19%)" | "401 teaching examples across 12 skills. 76 based on real customer conversations." |
| "Grader: 9 trace-derived + 25 rule-based criteria" | "Quality checker with 34 rules, 9 based on where real customers struggled." |
| "Chose 0.8B (34% learnable vs 16% for 4B)" | "Using the smaller model — it has more room to learn from your data." |

## Implementation Approach

This is NOT a rewrite — it's a **layer on top of the existing UI**:

1. **Add plain-language summaries** to each section (using the shared `analysis.json` — the agent writes accessible summaries)
2. **Wrap technical sections** in collapsible "Show details" toggles
3. **Add "What to do next" banners** after each completed step
4. **Rename sidebar labels** to non-jargon equivalents

The technical details remain accessible for power users — they're just not the default view anymore.

## Research Sources

- OpenAI Fine-tuning Playground UX
- Apple CreateML documentation
- Obviously AI product design
- Lobe.ai (Microsoft) design principles
- Stripe Dashboard contextual education
- TurboTax wizard pattern
- Figma progressive disclosure model
- Nielsen Norman Group: Progressive Disclosure
