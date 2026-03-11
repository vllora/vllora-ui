# Architecture Comparison: Lucy vs Claude Code

Side-by-side comparison of how each system handles the finetune pipeline, with focus on the two iteration loops and async job lifecycle.

---

## Two Loops, Two Score Types

```
                    ┌──────────────────────────────────────────┐
                    │         INNER LOOP (Dataset Iteration)    │
                    │         Uses: DRY RUN (EVAL) SCORES       │
                    │                                           │
     ┌──────────┐   │  Generate → Upload → Eval → Analyze ──┐  │
     │  Topics   │──►│                                    │  │  │
     │  Grader   │   │  ◄── Adjust (Levers 1-3, 5) ◄─────┘  │  │
     └──────────┘   │                                           │
                    │  Dry run scores healthy? ──── YES ────────┤
                    └───────────────────────────────────────────┘
                                                                │
                    ┌──────────────────────────────────────────┐
                    │         OUTER LOOP (Training Iteration)   │
                    │         Uses: TRAINING (FINETUNE) SCORES  │
                    │                                           │
                    │  Train → Analyze epochs → Post-eval ──┐  │
                    │                                    │  │  │
                    │  ◄── Adjust (Lever 4) ◄────────────┘  │  │
                    │  ◄── Back to inner loop? ◄─────────┘  │  │
                    │                                           │
                    │  Fine-tuned > Base? ──── YES ────────────┤
                    └───────────────────────────────────────────┘
                                                                │
                                                            DEPLOY
```

**Lucy today (2026-03-10)**: Has the pipeline with reactive analysis tools and auto-trigger on job completion. `analyze_evaluation`, `analyze_training`, and `get_training_metrics` run reactively — either via catch-up on session reopen (`buildCatchUpContext`) or via auto-trigger when jobs complete in background (`vllora_dry_run_job_completed` / `vllora_finetune_job_completed` events → LucySidebar → `vllora_lucy_prompt`). Full RFT decision tree implemented in `analyze_evaluation`. Iteration state persisted in IndexedDB. Agent md has inner/outer loop protocol. `ExecutionStepId` extended with `regenerate_topic`, `adjust_grader`, `analyze`, `post_training_eval` — all registered in `STEP_REGISTRY` and `STEP_ORDER` with executors. Both loops fully operational.

---

## Decision Making

```
Lucy Agent (Current — as of 2026-03-09):
  User request
    → Orchestrator generates plan (topics + grader during planning)
    → Orchestrator executes plan steps sequentially
    → Eval fires-and-forgets (no blocking)
    → Skill Package + Training proceed immediately
    → When eval/training completes → auto-trigger event → Lucy auto-sends analysis message
    → analyze_evaluation / analyze_training run REACTIVELY (auto-trigger or catch-up on reopen)
    → Agent md has inner/outer loop protocol (works via instruction compliance)
    → Iteration state persisted in IndexedDB (cross-iteration memory works)
    → ExecutionStepId extended: regenerate_topic, adjust_grader, analyze, post_training_eval
    → get_training_metrics fetches raw GRPO/GSPO reinforcement metrics with alert thresholds

Enhanced Lucy (Proposed):
  User request
    → Orchestrator routes to sub-agent
    → Sub-agent executes plan steps
    → After dry run eval: ANALYZE dry run scores
      → Compare with previous iteration dry run scores
      → Diagnose weak topics using grader reasons
      → Propose targeted changes (which lever to pull)
    → User approves/modifies/rejects
    → RE-PLAN and iterate (inner loop)
    → When dry run scores healthy: TRAIN
    → After training: ANALYZE training scores per epoch
      → Check overfitting, reward hacking
      → Run post-training dry run eval (fine-tuned vs base)
    → If all good: DEPLOY (outer loop complete)

Claude Code Skill (Reference):
  User request
    → Claude reads SKILL.md + knowledge/ files
    → Claude reasons with full LLM context
    → Claude executes directly (Read, Write, Bash)
    → After eval: reads full response, diagnoses per-record
    → Decides next action based on results
    → No fixed steps — Claude drives both loops autonomously
```

**Key diff**: Enhanced Lucy gets both loops but keeps the human-in-the-loop plan approval. Claude Code is fully autonomous.

---

## Evaluation & Analysis

```
Lucy (Current):
  run_evaluation(dataset_id)
    → Starts async dry run job → polls → returns summary
    → Agent sees: { avg_score: 0.45, passed: 52, failed: 80 }
    → Agent knows "it's bad" but not WHY
    → No cross-model comparison
    → No cross-iteration comparison

Enhanced Lucy (Proposed):
  run_evaluation(dataset_id, model, grader)
    → Starts async dry run job → polls → returns when done
  get_evaluation_details(eval_id)
    → Returns per-record dry run scores + grader reasons + per-topic breakdown
  analyze_evaluation(eval_id, dataset_id)
    → Compares dry run scores with previous iterations
    → Detects stall patterns
    → Generates recommendations (which lever to pull)
  Score matrix: user can run eval on multiple models × multiple graders

Claude Code Skill:
  curl POST /finetune/evaluations → poll → read full JSON
    → Every record's dry run score + reason + response content
    → Groups by topic, sorts by worst
    → Reads worst records, diagnoses root cause
    → Acts on diagnosis: rewrites prompts, adjusts grader
    → Runs on multiple models, compares results
```

**Key diff**: Enhanced Lucy gets structured analysis via tools. Claude Code reads raw JSON and reasons freely.

---

## Iteration Loop

```
Lucy (Current):
  Iteration 1: Plan → execute → eval → avg=0.45 → "NO-GO" → done
  (No iteration 2. Pipeline runs once.)

Enhanced Lucy (Proposed):
  Iteration 1:
    Plan → execute → dry run eval → avg=0.45
    → ANALYZE: pins=0.22 (grader says "confuses pins with forks")
    → PROPOSE: fix pin prompts, add combos
    → User approves
  Iteration 2:
    Execute targeted changes → re-eval → avg=0.58
    → ANALYZE: pins improved 0.22→0.45, combos 0.40→0.52
    → PROPOSE: continue, add endgame records
  Iteration 3:
    Execute → re-eval → avg=0.62
    → Dry run scores healthy → TRAIN
  Post-Training:
    Training scores: all topics improving, no overfitting
    Post-training dry run eval: fine-tuned >> base
    → DEPLOY ✓

Claude Code Skill:
  Same as Enhanced Lucy but fully autonomous
  (no user approval needed between iterations)
```

---

## Async Job Lifecycle

```
Lucy (Current — as of 2026-03-09):
  Start job → poll → show summary when done
  Job completes → auto-trigger event → Lucy auto-sends analysis message
  User navigates away → polling continues → results saved to IndexedDB
  User returns → buildCatchUpContext checks unreviewed jobs → Lucy catches up
  Iteration state persisted → Lucy knows iteration number, pending proposals
  Missing: sidebar notification badge for visual indicator

Enhanced Lucy (Proposed):
  Start job → poll → Lucy narrates progress inline
  If >30s: offer "Continue in background"
  If >60s: proactively suggest background mode

  User navigates away:
    → Polling continues (DryRunPollingManager / FinetuneJobsContext)
    → Results saved to IndexedDB with reviewedByAgent=false
    → Notification badge on Lucy sidebar icon

  User returns:
    → Lucy's catch-up protocol runs:
      1. Check for unreviewed completed jobs → present results + analysis
      2. Check for failed jobs → present error + suggestions
      3. Check for pending proposals → re-present them
      4. Check for running jobs → show progress
      5. Nothing pending → show DatasetStatusSummary

  See session-lifecycle.md for full design.
```

---

## What Lucy Needs to Match Claude Code

```
Current Lucy:           Enhanced Lucy:
┌─────────────┐         ┌─────────────┐
│   Router    │         │   Router    │
│  (propose   │         │  (propose   │
│   + route)  │         │   + route)  │
└──────┬──────┘         └──────┬──────┘
       │                       │
┌──────▼──────┐         ┌──────▼──────┐
│  Execute    │         │  Execute    │
│  (fixed     │         │  (adaptive  │
│   steps)    │         │   steps)    │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │                ┌──────▼──────┐
       │                │  Analyze    │  ← Dry run scores (inner loop)
       │                │  (diagnose  │  ← Training scores (outer loop)
       │                │   + decide) │  ← Cross-iteration comparison
       │                └──────┬──────┘
       │                       │
       │                ┌──────▼──────┐
       │                │  Re-plan    │  ← Targeted improvements
       │                │  (iterate   │  ← Escalation strategy
       │                │   or train) │  ← User approval
       │                └──────┬──────┘
       │                       │
       │                ┌──────▼──────┐
       │                │  Catch-up   │  ← Session resumption
       │                │  (on reopen │  ← Unreviewed results
       │                │   or return)│  ← Pending proposals
       │                └──────┬──────┘
       │                       │
┌──────▼──────┐         ┌──────▼──────┐
│  Done       │         │  Done       │
│  (or stuck) │         │  (deployed  │
│             │         │   or        │
│             │         │   escalated)│
└─────────────┘         └─────────────┘
```

The core additions are:
1. **Feedback loop** between execution and planning (Analyze → Re-plan → Execute)
2. **Two loops** (inner for dataset, outer for training)
3. **Two score types** clearly distinguished (dry run vs training)
4. **Session lifecycle** (catch-up, background transition, notification)
