# Evaluator Versioning UX Design

## Problem

When comparing eval runs (e.g., eval-v1 score 0.72 vs eval-v2 score 0.82), users need to know: **did the data improve, or did we just change the grader?** Without version tracking, scores across runs aren't comparable.

The grader script is a prerequisite for both eval runs and finetune jobs. Each job should capture a snapshot of the grader version used, so historical results remain auditable.

---

## Options Considered

### Option A: Version Badge on Each Job

Small `v2` pill on each eval run and finetune job in sidebar and header.

| Pros | Cons |
|------|------|
| Minimal UI footprint | Badge alone doesn't show *what* changed |
| Quick scan: spot which runs used same grader | Need to navigate elsewhere for diff |
| Easy to see when grader changed between runs | No inline comparison |

**Reference apps:** GitHub Actions (commit SHA per run), Vercel (git commit per deployment).

### Option B: "Evaluator Used" Section in Job Detail

Collapsible section in eval/finetune detail showing the exact grader code snapshot (read-only), with diff link to current version.

| Pros | Cons |
|------|------|
| Full context in one place | Takes vertical space in job detail |
| Read-only snapshot enables historical audit | Duplicates grader code across views |
| Can show diff to current version | Overwhelming if user doesn't care about grader |

**Reference apps:** Weights & Biases (full config per run), MLflow (params + source hash), Datadog (config at time of alert).

### Option C: Version Timeline on Grader Page

Grader page owns version history. Shows which jobs used each version. Diff versions side-by-side.

| Pros | Cons |
|------|------|
| Single source of truth | Requires navigating away from job |
| Reverse lookup: "which jobs used v2?" | Connection between job and version is indirect |
| Natural place for side-by-side diff | Users must mentally link two pages |

**Reference apps:** Terraform (plan history), GitHub (file history on file page).

---

## Industry Patterns

| App | Pattern |
|-----|---------|
| **W&B (Weights & Biases)** | Light badge on run + full config in run detail + diff view |
| **MLflow** | Full params stored per run, compare button across runs |
| **GitHub Actions** | Commit SHA badge on each run, click to see exact config |
| **Datadog** | Alert shows "config at time of alert" + audit trail on monitor page |
| **OpenAI Fine-tuning** | Hyperparams per job, no eval versioning |
| **Humanloop** | Prompt versions tracked per evaluation, side-by-side comparison |
| **Braintrust** | Scorer versions linked to each eval run |
| **Promptfoo** | Eval config stored per run, diff across runs |

The pattern that works best for evaluation/grading (Humanloop, Braintrust, Promptfoo):

> **Badge + expandable snapshot + diff indicator**

---

## Recommended Approach: Hybrid A + B

Combine lightweight badge (A) with expandable snapshot (B), plus a staleness warning.

### 1. Version Badge (Always Visible)

In eval job and finetune job headers, show a small version badge:

```
Eval Job Header:
[gpt-4o-mini] [Completed] [GO] [📝 v2]    50 samples · Avg 0.82
```

In sidebar items:

```
⚡ eval-v2    [v2] [done]
⚡ eval-v1    [v1] [done]
🧠 ft-a13e42  [v2] [running]
```

### 2. Expandable Snapshot (Click to Reveal)

Clicking the version badge in job detail expands an inline read-only view of the frozen grader code:

```
┌─────────────────────────────────────────────────┐
│ 📝 Evaluator v2 (used for this run)        [×]  │
│─────────────────────────────────────────────────│
│  1  // Grader Script — LLM-as-Judge             │
│  2  const { callLLM } = require('vllora/eval'); │
│  3                                               │
│  4  async function evaluate(input) {             │
│  ...                                             │
│ 32  module.exports = { evaluate };               │
│─────────────────────────────────────────────────│
│ Saved Mar 15, 14:30 · 32 lines · gpt-4o judge   │
└─────────────────────────────────────────────────┘
```

**Default state:** collapsed (just the badge).
**Expanded state:** full grader code, read-only, with metadata footer.

### 3. Diff Indicator

If the current grader has been updated since the job ran, the badge shows a warning and offers an inline diff:

**Badge state when grader changed:**

```
[📝 v2 ⚠]  ← tooltip: "Grader updated since this run (now v3)"
```

**Clicking the ⚠ opens a diff view** — two-column comparison showing exactly what changed between the version used for this job and the current version:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 📝 Evaluator Changed: v2 → v3 (current)                       [×]  │
│──────────────────────────────────────────────────────────────────────│
│  v2 (this run)                    │  v3 (current)                   │
│──────────────────────────────────────────────────────────────────────│
│  14  { role: 'system',           │  14  { role: 'system',          │
│  15    content: `Score the       │  15    content: `Score the      │
│  16    response on accuracy,     │  16    response on accuracy,    │
│- 17    and clarity.`             │+ 17    clarity, and use of      │
│                                   │+ 18    algebraic notation.`     │
│  18  },                          │  19  },                          │
│──────────────────────────────────────────────────────────────────────│
│ 2 lines changed · v2 saved Mar 15 · v3 saved Mar 17                │
│                                                                      │
│ ⚠ Scores from this run used v2. Re-run eval with current grader     │
│   to get comparable scores.                     [Re-run with v3 →]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Three badge states:**

| State | Badge | Meaning |
|-------|-------|---------|
| Current | `[📝 v3]` | Job used the latest grader — scores are current |
| Stale | `[📝 v2 ⚠]` | Grader has been updated since — click to see diff |
| Same version | `[📝 v2]` | No changes — safe to compare with other v2 runs |

**Key UX principle:** The diff answers the most important question: "Can I trust comparing this run's scores with newer runs?" If the diff shows only cosmetic changes (comments, formatting), scores are still comparable. If the diff shows criteria changes (new scoring rubric, different judge model), scores are not.

### 4. Grader Page: Version History (Secondary)

On the grader page, show a version timeline with reverse lookup and inline diffs:

```
VERSION HISTORY
───────────────────────────────────────────────────────────────────
v3 (current)  Mar 17, 10:00  — Added algebraic notation check
                               No jobs yet

v2            Mar 15, 14:30  — Switched to GPT-4o judge
                               Used by: eval-v2, ft-a13e42
                               [View diff v1→v2]

v1            Mar 12, 09:15  — Initial grader (rule-based)
                               Used by: eval-v1
```

Click any version to:
- See the full frozen code
- Diff against current version
- Diff against any other version (dropdown)
- See which jobs used this version

Click any version to see the code or diff against current.

---

## UX Flow Summary

All three elements — **Badge + Expandable Snapshot + Diff Indicator** — work together:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. BADGE (always visible)                                       │
│    [📝 v2] or [📝 v2 ⚠]                                        │
│    → At a glance: which version, is it current?                 │
│                                                                  │
│ 2. EXPANDABLE SNAPSHOT (click badge)                            │
│    Shows frozen grader code used for this specific job          │
│    → Full audit: exactly what criteria scored these records     │
│                                                                  │
│ 3. DIFF INDICATOR (click ⚠ warning)                            │
│    Side-by-side diff: version used vs current version           │
│    → Trust check: are scores comparable across runs?            │
│    → Action: "Re-run with current grader" button                │
└─────────────────────────────────────────────────────────────────┘
```

**Usage frequency:**

```
90% of the time:  User sees [📝 v2] badge → knows which grader was used
 7% of the time:  User clicks badge → sees frozen grader code inline
 2% of the time:  User clicks ⚠ → sees diff, decides if re-run needed
 1% of the time:  User goes to grader page → compares versions across jobs
```

### Key Principle

**Low noise by default, full auditability on demand.**

The three layers progressively reveal more detail. Most users never need to go past the badge. Power users who care about score comparability get the diff. And the grader page serves as the complete audit trail.

---

## Implementation Notes

### Backend

- Each eval job and finetune job should store `evaluator_version_id` (FK to evaluator versions table)
- Evaluator versions table: `id`, `version`, `code`, `created_at`, `workflow_id`
- On grader save: create new version, increment version number
- On eval/finetune start: record current evaluator version ID with the job

### Frontend

- `EvaluatorVersionBadge` component already exists (`src/components/datasets/eval-dialog/DryRunActivityView.tsx`)
- Extend to show staleness warning when `job.evaluator_version < current_version`
- Add expandable code view (reuse Monaco editor in read-only mode or simple `<pre>` block)
- Grader page: add `EvaluatorVersionHistory` section (component already exists at `src/components/finetune/content/EvaluatorVersionHistory.tsx`)

### Existing Code References

| Component | File | Current State |
|-----------|------|---------------|
| `EvaluatorVersionBadge` | `src/components/datasets/eval-dialog/DryRunActivityView.tsx:86` | Shows `v{N}` badge, no staleness warning |
| `EvaluatorVersionHistory` | `src/components/finetune/content/EvaluatorVersionHistory.tsx` | Shows version list in finetune job detail |
| `getEvaluatorVersions()` | `src/services/finetune-api.ts` | Fetches version list from backend |
| `EvaluationConfigPanel` | `src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx` | Grader editor with save/run |

### What Needs to Be Built

1. **Staleness indicator**: Compare `job.evaluator_version` with latest version, show ⚠ if different
2. **Expandable snapshot**: Click version badge → show frozen code inline (read-only `<pre>` or Monaco)
3. **Version metadata on grader page**: "Used by: eval-v1, eval-v2" reverse lookup
4. **Sidebar version pills**: Show version number on eval/finetune sidebar items
