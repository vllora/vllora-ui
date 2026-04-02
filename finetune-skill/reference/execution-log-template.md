# Execution Log Template

This is a **reference** for what to log at each step — NOT a skeleton to copy upfront. At the start of the pipeline, create `execution-log.md` with only the title. Then **append each step's section only when that step completes.** The log should never contain empty sections for steps that haven't run yet.

**How to use:** After completing each step, look up that step's section below and append it (filled in) to `execution-log.md`.

---

```markdown
# Execution Log — <Project Name>

## Step 1: Define Objective
- [timestamp] Workflow: <ID>
- Objective: <statement>
- System prompt: "<root persona>"
- Documents: <list of PDFs>

## Step 2: Extract Documents
- [timestamp] Docling status: available/unavailable (fallback used: yes/no)
- Per document:
  - <doc-name>: <N> chunks from Docling, <M> parts after build_knowledge_parts, <K> tables
  - Reused existing: yes/no
- Merge: <total> parts from <N> documents
- Validation: PASS/FAIL (issues: <details if FAIL>)
- Gateway verify: <N> sources, <M> total parts, names match: yes/no
- Issues: <any problems encountered>

## Step 3: Build Topics
- [timestamp] Relevance filter: <total> parts → <relevant> relevant, <excluded> excluded
  - Sample excluded: <2-3 excluded part titles>
- Topics: <N> total (<M> leaf), hierarchy: <domain names>
- Difficulty: <N> easy, <N> medium, <N> hard
- System prompts: self-check passed: yes/no (issues: <which topics failed>)
- Relations: <N> total, per-topic range: <min>-<max>, cross-doc: <doc1>=<N>, <doc2>=<M>
- Upload: topics=<N>, relations=<N>, relevance labels=<N>

## Step 4: Generate Records
- [timestamp] Mode: relations / rag-only / nemo
- Records per topic: <default or custom>
- Generated: <total> records across <N> topics
- Per-topic: <topic>: <count>, ... (or "see training.jsonl")
- source_parts coverage: <N>/<total> records have per-record tagging
- Dedup: removed <N> near-duplicates
- Upload: <total> records to gateway

## Step 5: Write Grader
- [timestamp] Template: <which template copied>
- Criteria: <list of scoring criteria + weights>
- Dry-run Test 1 (hand-crafted): score=<X>, reason="<summary>"
- Dry-run Test 2 (live model): scores=<X, Y, Z> for 3 samples
- Gateway verify: evaluator uploaded: yes/no
- Upload: grader.js to gateway

## Step 5.5b: Data Quality Gate
- [timestamp] Quick gate: PASS/FAIL/WARN
  - Structural: <pass/fail details>
  - Diversity: <pass/fail details>
- Full gate (if run): GT quality=<avg>, Alignment=<avg>
- Issues found: <list or "none">

## Step 6: Verify & Hand Off
- [timestamp] Gateway status: records=<N>, topics=<N>, sources=<N>, grader=YES/NO
- All data verified on gateway

## Step 7: Evaluation
- [timestamp] Eval job: <ID>, model: <name>
- Duration: <minutes>
- Results: avg=<X>, std=<Y>, zero_frac=<Z>%, mode=<val> at <frac>%
- Per-topic scores: <topic>=<avg>, ...
- Readiness gate: PASS/FAIL (hard checks: <details>)

## Step 7d: Training (if readiness passed)
- [timestamp] Training job: <ID>, base model: <name>
- Config: epochs=<N>, max_output_tokens=<N>, learning_rate=<N>
- Duration: <hours>
- Final reward: <X>, KL: <Y>

## Step 8: Analysis
- [timestamp] Per-topic breakdown: <weakest topics>
- Dead-weight records: <N> scoring 0.0
- Recommendations: <fix grader / regenerate data / retrain>

## Step 9: Iteration (if needed)
- [timestamp] Iteration <N>: <what was changed and why>
- Changes: <data fix / grader fix / hyperparams>
- Re-eval results: avg=<X> (was <Y>)
```

---

## What Makes a Good Log Entry

Each step entry should be detailed enough that anyone reading it can understand:

1. **What happened** — inputs, outputs, counts, timing
2. **What decisions were made** — strategy for LLM-driven actions (e.g., "chose compliance grader template because domain involves IRS rules")
3. **What failed** — log the failure BEFORE the fix, so there's a record of what went wrong
4. **What was skipped** — if reusing existing extractions, note it

## Common Patterns

**Logging a failure + fix:**
```markdown
- [timestamp] Dry-run Test 2 (live): all 3 samples scored 0.0
  - Issue: grader expects "Eligible. EIC: $X" format but model responds with prose paragraphs
  - Fix: added LLM extraction fallback to parse amount from unstructured response
- [timestamp] Dry-run Test 2 (retry): scores=0.7, 0.3, 1.0 — PASS
```

**Logging a resume:**
```markdown
## Resumed — [timestamp]
- Previous crash: during Step 4 (record generation), 150/250 records generated
- Status: records=150, topics=13, sources=2, grader=YES
- Picking up from Step 4 with --append
```

**Logging a decision:**
```markdown
- Strategy: using compliance grader template (grader-compliance.js) because EIC rules
  require exact dollar amounts — programmatic scoring for amount accuracy + LLM-as-judge
  for eligibility reasoning quality
```
