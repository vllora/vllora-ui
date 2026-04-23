# Testing Workflow Guide

> **Purpose**: How to run, test, and iterate on the trace-informed finetune pipeline.
> **Audience**: Anyone working on this project (human or AI agent).

## Quick Start

```bash
# 1. Pre-flight check (catches known issues before wasting time)
cd ~/Documents/GitHub/vllora/ui
bash scripts/pre-test-check.sh ~/Documents/GitHub/test-samples/tau-retail-combined

# 2. Clean previous run data (if any)
rm -rf ~/Documents/GitHub/test-samples/tau-retail-combined/{finetune-project,finetune-runs,.claude}

# 3. Kill orphaned processes
/finetune-kill tau-retail-combined

# 4. Run the test
/finetune-run tau-retail-combined

# 5. Monitor (while running)
# Check transcript, gateway, UI in browser at localhost:5173

# 6. Stop when done (or let it finish)
/finetune-kill tau-retail-combined

# 7. Analyze results
/finetune-analyze tau-retail-combined
```

---

## Tools Available

### Scripts (bash)

| Script | How to run | What it does |
|---|---|---|
| `scripts/pre-test-check.sh <dir>` | `bash scripts/pre-test-check.sh ~/...` | 12 automated checks: gateway, dev server, traces, stale paths, syntax, types |
| `scripts/run-finetune-agent.sh <dir>` | Called by `/finetune-run` | Syncs skill, launches headless Claude Code, saves transcript |
| `scripts/kill-finetune-agent.sh <dir>` | Called by `/finetune-kill` | Kills main agent + orphaned subagents + training monitors |

### Skills (Claude Code slash commands)

| Skill | Usage | What it does |
|---|---|---|
| `/finetune-run <scenario>` | `/finetune-run tau-retail-combined` | Syncs skill, runs pipeline, saves transcript |
| `/finetune-kill <scenario>` | `/finetune-kill tau-retail-combined` | Kills all processes for a scenario |
| `/finetune-analyze <scenario>` | `/finetune-analyze tau-retail-combined` | Analyzes last run: checks each step, queries gateway, reports issues |
| `/audit-consistency` | `/audit-consistency` | Cross-references paths, labels, types across SKILL.md, scripts, UI |
| `/pre-test-check` | Ask Claude to run it | Accumulated checks from past test findings |

### Hooks (automatic)

| Hook | Trigger | What it does |
|---|---|---|
| `post-edit-typecheck.sh` | After Edit/Write on .ts/.tsx | Runs `npx tsc --noEmit`, reports errors |
| `doc-sync-reminder.sh` | After Edit/Write on source dirs | Reminds to update docs |
| `console-log-warning.sh` | After Edit/Write on .ts/.tsx | Warns about console.log in non-test files |
| `stale-path-check.sh` | After Edit/Write on any file | Warns about old folder paths (evaluations/ → test-runs/, etc.) |

---

## The Full Test Cycle

### Phase 1: Before Testing

```bash
# Run pre-flight checks
bash scripts/pre-test-check.sh ~/Documents/GitHub/test-samples/tau-retail-combined
```

Expected output:
```
═══════════════════════════════════════════════════════
  Pre-Test Check: tau-retail-combined
═══════════════════════════════════════════════════════

  ✓ Gateway running at localhost:9090
  ✓ Dev server running at localhost:5173
  ✓ Test folder clean (no previous data)
  ✓ Traces file exists
  ✓ PDF/doc found in pdfs/
  ✓ No orphaned processes
  ✓ All Python scripts: syntax OK
  ✓ TypeScript: clean
  ✓ No stale folder references
  ✓ SKILL.md has cancel-before-re-eval logic
  ✓ SKILL.md has objective-target-tokens task-type table
  ✓ Gateway has trace_analyses table

  Results: 12 passed, 0 warnings, 0 failed
  ✓ All checks passed — ready to test!
═══════════════════════════════════════════════════════
```

**If any check fails**, fix it before running the test. Common fixes:
- Gateway not running → `bash scripts/restart-backend.sh`
- Dev server not running → `npm run dev` (in separate terminal)
- Previous data exists → `rm -rf <scenario>/finetune-project <scenario>/finetune-runs <scenario>/.claude`
- Traces missing → regenerate with `tau_bench_to_otel.py` (see test-samples/tau-retail-combined/README.md)

### Phase 2: Running the Test

```bash
/finetune-run tau-retail-combined
```

This:
1. Syncs the latest skill + agents to the scenario's `.claude/` folder
2. Reads `finetune-prompt.md` for instructions
3. Launches Claude Code headlessly
4. Saves transcript to `finetune-runs/run-YYYYMMDD-HHMMSS/`

### Phase 3: Monitoring

While the test runs, check:

**Transcript** (real-time progress):
```bash
tail -f ~/Documents/GitHub/test-samples/tau-retail-combined/finetune-runs/run-*/transcript.md
```

**Gateway data** (what was uploaded):
```bash
WF_ID=$(python3 -c "import json; print(json.load(open('$HOME/Documents/GitHub/test-samples/tau-retail-combined/finetune-project/config.json'))['workflow_id'])")
curl -s "http://localhost:9090/finetune/workflows/$WF_ID" | python3 -m json.tool | head -20
```

**UI** (visual verification):
Open `http://localhost:5173/finetune` in browser, click into the workflow.

### Phase 4: Checking Results

After the run completes (or you stop it):

```bash
/finetune-analyze tau-retail-combined
```

This checks every pipeline step and reports pass/fail.

**What to verify manually:**

1. **Trace analysis artifacts** — do they exist in `finetune-project/trace-analysis/`?
   ```bash
   ls -la ~/...tau-retail-combined/finetune-project/trace-analysis/
   ```

2. **Records** — were they trace-weighted?
   ```bash
   python3 -c "
   import json
   from collections import Counter
   records = [json.loads(l) for l in open('finetune-project/training.jsonl')]
   print(f'Total: {len(records)}')
   print(f'Seeds: {sum(1 for r in records if r.get(\"prompt_type\")==\"seed_query\")}')
   topics = Counter(r['topic'] for r in records)
   for t, c in topics.most_common(5): print(f'  {t}: {c}')
   "
   ```

3. **Record quality** — check generated data makes sense:
   ```bash
   python3 -c "
   import json
   records = [json.loads(l) for l in open('finetune-project/training.jsonl')]
   # System prompt length (should be < 500 chars, NOT 7000+)
   for m in records[0]['messages']:
       if m['role'] == 'system':
           print(f'System prompt: {len(m[\"content\"])} chars')
           break
   # Ground truth coverage
   has_gt = sum(1 for r in records if r.get('ground_truth'))
   print(f'Ground truth: {has_gt}/{len(records)} ({has_gt*100//len(records)}%)')
   # Seed query dedup check
   seeds = [r for r in records if r.get('prompt_type') == 'seed_query']
   print(f'Seed queries: {len(seeds)}')
   "
   ```

4. **Gateway records match disk** — all records uploaded:
   ```bash
   WF_ID=...
   curl -s "http://localhost:9090/finetune/workflows/$WF_ID/records?limit=1" | python3 -c "
   import sys, json; d=json.load(sys.stdin); print(f'Gateway: {d.get(\"total\", \"?\")} records')
   "
   wc -l < finetune-project/training.jsonl
   # These numbers should match
   ```

5. **UI display** — check in browser:
   - Source Materials: both PDF and OTel Traces visible?
   - OTel Traces → flat tabs: Traces | Priority | Grader Hints | Seed Queries?
   - Teaching Examples: topic hierarchy with counts?
   - Activity Log → Step Analysis: decision cards expanding?
   - Section insights showing under sidebar headers?

4. **Gateway** — is trace analysis stored?
   ```bash
   curl -s "http://localhost:9090/finetune/workflows/$WF_ID/trace-analysis" | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   print(f'Priority: {len(d.get(\"priority\",{}))} topics')
   print(f'Dimensions: {len(d.get(\"grader_hints\",{}).get(\"dimensions\",[]))}')
   "
   ```

### Phase 5: Finding and Fixing Issues

When you find an issue:

1. **Identify** — what's wrong (stale path, UI glitch, skill logic error, missing upload)
2. **Fix** — edit the code
3. **Verify** — type check passes, syntax OK
4. **Add check** — add a new check to `scripts/pre-test-check.sh` so it's caught next time
5. **Run audit** — `/audit-consistency` to check nothing else broke

### Phase 6: Re-testing

```bash
# Clean
rm -rf ~/Documents/GitHub/test-samples/tau-retail-combined/{finetune-project,finetune-runs,.claude}
/finetune-kill tau-retail-combined

# Pre-flight (now includes your new check!)
bash scripts/pre-test-check.sh ~/Documents/GitHub/test-samples/tau-retail-combined

# Run again
/finetune-run tau-retail-combined
```

---

## What Each Pipeline Step Should Produce

| Step | Output folder | Key files | What to check |
|---|---|---|---|
| Step 1: Objective | `finetune-project/` | `config.json` | workflow_id, combined mode detected |
| Step 2A: Extract | `knowledge/` | `knowledge_parts.json`, `parts-index.json` | 8+ parts from the 30-page policy PDF |
| Step 2C: Trace analysis | `trace-analysis/` | `priority.json`, `topics.json`, `prompts.json`, `grader-hints.json` | 12 topics, 292 seeds, 34 dimensions |
| Step 3: Topics | root | `topics.json`, `relations.json` | 12+ leaf topics, all have relations |
| Step 4: Records | root | `training.jsonl` | 300-500 records, ~20% seed queries, trace-weighted allocation |
| Step 5: Grader | `quality-checker/` | `grader-draft.js`, `grader.js` | Draft auto-generated, then customized |
| Step 5.5: Validate | root | `pipeline-journal.json` | Quality gate PASS or WARN (not FAIL) |
| Step 6: Verify | — | gateway has all data | Records, topics, sources, grader all uploaded |
| Step 7: Eval | `test-runs/` | `eval-001.json`, `eval-002.json` | Both models evaluated |
| Step 8: Train | `training/` | `train-001.json`, metrics | Training started or completed |
| Shared | root | `analysis.json` | Per-section insights in plain language |

---

## Self-Improving: Adding New Checks

When you find a new issue during testing, add it to `scripts/pre-test-check.sh`:

```bash
# Example: adding a check for new issue
# 13. [Your new check description]
if grep -q "your_pattern" some_file 2>/dev/null; then
  check "Your check description" pass
else
  check "Your check description — fix by doing X" fail
fi
```

Also save the finding to memory:
```bash
# In Claude Code:
# Save as feedback: "When X happens, do Y because Z"
```

Over time, `pre-test-check.sh` becomes a comprehensive regression test for the development process itself. Each cycle adds checks. After 5-10 cycles, it catches most issues automatically.

---

## Troubleshooting

### "Gateway not running"
```bash
bash scripts/restart-backend.sh
```

### "Traces file missing"
```bash
git clone --depth 1 https://github.com/sierra-research/tau-bench.git /tmp/tau-bench
python3 docs/workflow-skill-first-approach/research-trace-pdf-combine/tau_bench_to_otel.py \
  --trajectories /tmp/tau-bench/historical_trajectories/gpt-4o-retail.json \
  --tools-dir /tmp/tau-bench/tau_bench/envs/retail/tools/ \
  --output ~/Documents/GitHub/test-samples/tau-retail-combined/source_traces_semconv.json
```

### "Orphaned processes"
```bash
/finetune-kill tau-retail-combined
# Or force kill:
pkill -9 -f "tau-retail-combined"
```

### "TypeScript errors"
```bash
npx tsc --noEmit 2>&1 | head -20
# Fix the errors, then re-run pre-test-check
```

### "Skill doesn't detect combined mode"
The SKILL.md uses `find` (not glob) for input detection. Check that:
- `pdfs/` directory exists with at least one `.pdf` or `.md` file
- `source_traces_semconv.json` exists in the scenario root
