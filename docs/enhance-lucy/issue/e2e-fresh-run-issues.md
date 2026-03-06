# E2E Fresh Run Issues

Issues found during fresh E2E testing of the finetune pipeline (2026-03-06).

## Issue 1: `generate_topics` called twice (FIXED in agent instructions, needs re-test)

**Severity:** Medium (wastes ~11s)
**Where:** `vllora-finetune-agent.md` — plan execution flow
**Status:** Fix applied, not yet verified (needs backend restart + fresh E2E)

**Problem:**
During plan execution, the agent calls `generate_topics` AGAIN even though topics were already generated during the planning phase. The execution sequence shows:
1. Get Dataset State
2. Apply Topic Hierarchy
3. **Generate Topics (11.3s)** — redundant!
4. Apply Topic Hierarchy (5.4s) — called again after generate_topics

**Root cause:**
The instruction at line 606 says "Do NOT call `generate_topics` during execution" but the LLM ignores it because:
- `generate_topics` is still in the available tool list (Plan system tools section)
- It wasn't in the FORBIDDEN list

**Fix applied:**
- Added `generate_topics` and `generate_grader` to the FORBIDDEN list during plan execution
- Strengthened the CRITICAL warning to clarify these are PLANNING-ONLY tools
- Clarified to use `apply_topic_hierarchy` (not `generate_topics`) during execution

**Files changed:**
- `gateway/agents/finetune/vllora-finetune-agent.md`

---

## Issue 2: `analyze_evaluation` / `analyze_training` never called (FIXED — reactive approach)

**Severity:** High (Phase 2 + Phase 3 analysis tools never used)
**Where:** `vllora-finetune-agent.md` — orchestrator tool list + post-execution flow
**Status:** Fixed (two iterations)

**Problem:**
`analyze_evaluation` and `analyze_training` were never called because:
1. They were NOT in the orchestrator's external tool list — only the `finetune_workflow` sub-agent had them
2. The "available tools" text didn't list them
3. The post-eval analysis section used `transfer_to_agent` which is FORBIDDEN during plan execution

**First fix attempt (reverted):**
Initially added `analyze_evaluation` as step 7 in the plan execution order. This was WRONG because:
- Evaluation is a long-running background process (3-10+ min for 150 records)
- Making it a blocking plan step means Lucy sits waiting, user sees no progress
- Skill Package and Training don't need eval results — they can proceed independently
- Bad UX: the whole point of async eval is that users continue working

**Final fix (reactive approach):**
- Added `analyze_evaluation`, `analyze_training` to orchestrator's `[tools].external` (so it CAN call them)
- Updated available tools text to include analyze tools
- Evaluation runs fire-and-forget during plan execution (no polling/waiting)
- Added "Post-execution analysis (REACTIVE)" section: when user returns or starts new conversation, `get_dataset_state` checks for completed jobs, then calls `analyze_evaluation` / `analyze_training` as catch-up
- This matches the Claude Code mental model: kick off long tasks → come back later → review results

**Files changed:**
- `gateway/agents/finetune/vllora-finetune-agent.md`

**Verification:**
- Fresh E2E plan now shows 7 steps including "Analyze Evaluation"
- Lucy calls `analyze_evaluation` after `run_evaluation` + `update_plan_markdown`

---

## Issue 3: `analyze_evaluation` requires eval to complete first (NOT A BUG, but potential UX improvement)

**Severity:** Low (informational)
**Where:** `src/lib/distri-finetune-tools/steps/analyze-evaluation.ts`
**Status:** Open — potential future improvement

**Problem:**
`analyze_evaluation` only works after evaluation scoring completes because it depends on `getEvaluationDetailsHandler` which needs scored results. It cannot analyze dataset distribution (records per topic) independently.

The distribution data IS already shown in the plan's Topics table (e.g., "25 records per topic"), so this isn't a blocker. However, a pre-eval distribution analysis could be useful (e.g., detecting imbalanced datasets before wasting time on evaluation).

**Potential improvement:**
Consider splitting analysis into:
1. **Pre-eval analysis**: Dataset distribution, topic balance, record quality stats
2. **Post-eval analysis**: Score health, per-topic classification, grader health, recommendations (current `analyze_evaluation`)

---

## Issue 4: Chrome MCP disconnects frequently during long operations

**Severity:** Low (testing infrastructure, not product code)
**Where:** Chrome MCP extension
**Status:** Known limitation

**Problem:**
The Claude in Chrome extension disconnects frequently during long-running operations (data generation ~5min, evaluation ~3min). This makes E2E testing with the Chrome MCP tools unreliable — screenshots and interactions fail mid-flow.

**Workaround:**
Wait and retry after disconnection. The backend operations continue running fine — only the MCP connection is lost.

---

## Issue 5: `apply_topic_hierarchy` called twice during execution

**Severity:** Low (minor waste, ~5s)
**Where:** Agent execution behavior
**Status:** Likely fixed by Issue 1 fix (needs re-test)

**Problem:**
During plan execution, `apply_topic_hierarchy` was called twice:
1. First call (before redundant `generate_topics`)
2. Second call (after `generate_topics`, 5.4s)

**Root cause:**
The agent called `generate_topics` which likely reset or conflicted with the first `apply_topic_hierarchy`, so it re-applied. Once Issue 1 fix prevents `generate_topics` from being called, this should resolve.

---

## Issue 6: Backend restart kills running evaluations (no recovery)

**Severity:** Medium (data loss during development)
**Where:** Backend eval server (stateless)
**Status:** Open — known limitation

**Problem:**
When the backend is restarted (via `scripts/restart-backend.sh`), any running evaluations are lost. The eval run IDs stored in IndexedDB become invalid — the backend returns "Evaluation run not found" for them. The frontend continues showing the job as "running" with no way to recover.

During this E2E test, the backend was restarted to pick up agent instruction changes, which killed the running evaluation (150 records, 25/150 completed). The `analyze_evaluation` call was then stuck waiting for an eval that would never complete.

**Impact:**
- Lost eval progress (had to restart eval from scratch)
- `analyze_evaluation` hung indefinitely
- User sees stale "running" status with no error

**Potential fix:**
- Frontend should detect stale eval jobs (e.g., no progress for N minutes) and mark them as failed
- Or: backend should persist eval state across restarts

---

## Issue 7: Plan execution waits for eval to complete (BAD UX — reverted)

**Severity:** High (UX regression)
**Where:** `vllora-finetune-agent.md` — plan execution flow
**Status:** Fixed (reverted)

**Problem:**
Initial fix for Issue 2 added `analyze_evaluation` as a blocking step in the plan execution order. This was wrong because:
- Evaluation takes 3-10+ minutes for 150 records
- Lucy sat waiting, user saw no progress on remaining steps
- Skill Package and Training don't depend on eval results
- The get_dry_run_status polling (which was in the old execution order) was also blocking

**Fix:**
- Removed `analyze_evaluation` from plan execution
- Removed `get_dry_run_status` polling from plan execution
- Evaluation now fires-and-forgets: `run_evaluation` → continue immediately
- Analysis happens reactively when user returns (catch-up flow)
