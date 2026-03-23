# Finetune Skill Pipeline Test — Issues Found

**Date**: 2026-03-23
**Test method**: Spawned autonomous sub-agent at `/test-samples/protein-meal-planner/` to consume the skill end-to-end
**Pipeline tested**: Steps 1-9 (objective → extraction → topics → records → grader → eval → training → analysis)
**Test data**: 4 PDFs (USDA Protein Foods, ISSN Protein Position Stand, ISSN Nutrient Timing, DGA 2025-2030)

## Summary

| Category | Count |
|----------|-------|
| BUG | 4 |
| UNCLEAR | 3 |
| FRICTION | 5 |
| **Total** | **12** |

Steps 1-6 (data pipeline) worked well after our fixes to `finetune.py` (topic UUID remapping, topological upload, record topic resolution). Steps 7-9 (eval/training/iteration) have significant issues — stale API references, no local job tracking, and confusing data flow.

---

## Critical Issues (fix first)

### ISSUE-001: [BUG] api-reference.md severely out of date
- **Impact**: HIGH — agents waste time trying dead endpoints
- **Details**: 6 dead endpoints still documented (`POST /finetune/datasets`, `POST /workflows/{id}/dataset/upload`, etc.), 17 real endpoints undocumented (`POST /evaluator/run`, `GET /jobs/{id}/metrics`, `GET /records/scores`, etc.)
- **Root cause**: Datasets concept was removed but docs not cleaned up. New endpoints added without doc updates.
- **Fix**: Full rewrite of `api-reference.md` from `gateway/src/http.rs` (source of truth). See `test-samples/protein-meal-planner/workspace/actual-api-endpoints.md` for the complete 76-endpoint map.
- **Files**: `finetune-skill/reference/api-reference.md`

### ISSUE-002: [BUG] Stale `/finetune/datasets` references in 6+ files
- **Impact**: HIGH — agents try non-existent endpoints, get 404s
- **Details**: Old datasets concept removed but references remain in: `api-reference.md` (12+ refs), `workflow-guide.md` (3 refs), `iteration-strategy.md` (2 refs), `upload_dataset.py` (entire script is dead), `README.md` (2 refs)
- **Fix**:
  1. Search-and-replace all `/finetune/datasets` references
  2. Delete `scripts/upload_dataset.py` (dead script)
  3. Replace with workflow-scoped equivalents: `POST /workflows/{id}/records`, `GET /workflows/{id}/finetune-evaluations`, `GET /workflows/{id}/analytics`
  4. Add note: "Eval and training read directly from workflow records — no separate dataset upload step needed. Gateway auto-uploads via `ensure_dataset_uploaded()`"
- **Files**: `api-reference.md`, `workflow-guide.md`, `iteration-strategy.md`, `README.md`, `scripts/upload_dataset.py`

### ISSUE-003: [BUG] SKILL.md Step 7 training job example missing `job_type` field
- **Impact**: MEDIUM — training job creation fails with 400
- **Details**: The curl example for creating a training job omits `"job_type": "provider_finetune"`, a required field. Gateway returns: `missing field 'job_type'`.
- **Fix**: Add `"job_type": "provider_finetune"` to the training job creation example in SKILL.md Step 7b.
- **Files**: `finetune-skill/SKILL.md`

### ISSUE-004: [BUG] Training job POST returns `provider_job_id`, not the internal `id`
- **Impact**: MEDIUM — agent can't use returned ID for subsequent GET requests
- **Details**: `POST /finetune/workflows/{id}/jobs` returns `{"job_id": "9ad5ace4..."}` (the provider_job_id). But `GET /jobs/{job_id}` expects the internal DB id. Using the returned ID gives 404.
- **Fix (gateway)**: Return both IDs in the creation response: `{"id": "c0a36d4a...", "provider_job_id": "9ad5ace4...", "status": "pending"}`
- **Fix (skill)**: Document the workaround: list all jobs and find by provider_job_id.
- **Files**: `gateway/src/handlers/finetune.rs`, `finetune-skill/SKILL.md`

---

## Unclear Instructions (clarify)

### ISSUE-005: [UNCLEAR] system_prompt location is confusing
- **Impact**: LOW — agent figures it out but wastes time
- **Details**: SKILL.md mentions `--system-prompt` on `create-workflow`, suggesting it's a workflow-level field. In reality, the system prompt is composed at record generation time: `generate_records.py --system-prompt` provides the root persona, each topic adds a segment, and the composed result is stored in each record's `messages[0]`. It's never stored on the workflow table.
- **Fix**: Remove `--system-prompt` from `create-workflow` examples. Add note: "The system prompt is composed at record generation time (Step 4) from the root persona + topic segments, stored in each record."
- **Files**: `finetune-skill/SKILL.md` (Step 1)

### ISSUE-006: [UNCLEAR] SKILL.md Step 7/9 says to "sync to cloud" after data changes
- **Impact**: MEDIUM — agent tries non-existent endpoint
- **Details**: SKILL.md Step 9 shows `curl -s -X POST .../dataset/upload` after fixing data. This endpoint doesn't exist. It's unclear whether eval reads from local SQLite directly or from a cloud copy.
- **Fix**: Clarify data flow: "The gateway auto-uploads workflow data to the cloud when creating an eval or training job (`ensure_dataset_uploaded()`). No manual sync step needed. After modifying records/grader, just create a new eval job — the gateway handles the rest."
- **Files**: `finetune-skill/SKILL.md` (Steps 7, 9)

### ISSUE-007: [UNCLEAR] API reference PUT /workflows/{id} accepted fields
- **Impact**: LOW
- **Details**: API ref says PUT updates "name, objective, eval_script, state" but doesn't clearly say which fields are silently ignored.
- **Fix**: List all accepted fields explicitly in the API reference.
- **Files**: `finetune-skill/reference/api-reference.md`

---

## Friction Points (improve)

### ISSUE-008: [FRICTION] No local tracking of eval/training jobs
- **Impact**: HIGH — agent has no local record of jobs, can't work offline
- **Details**: Three problems:
  1. `training_job_id.txt` has stale failed job ID, never updated on retry
  2. `workspace/evaluations/` folder empty despite eval running (165/225 records)
  3. `workspace/training-jobs/` folder empty despite 2 jobs on gateway
  The skill creates these directories but has no instructions or scripts to populate them.
- **Fix**:
  1. Add `finetune.py create-eval` / `create-training` that auto-save job metadata locally
  2. Add `finetune.py poll-eval` / `poll-training` that save results when done
  3. Standard structure: `evaluations/eval-001.json`, `training-jobs/train-001.json`
  4. On retry, create `train-002.json` (versioned), don't overwrite
- **Files**: `finetune-skill/scripts/finetune.py`, `finetune-skill/SKILL.md`

### ISSUE-009: [FRICTION] No local copy of eval results saved to workspace
- **Impact**: MEDIUM — can't review past eval runs, agent has to re-query gateway
- **Details**: Eval results (scores per record, per-topic breakdown, avg score) exist on the gateway but nothing is saved to `workspace/evaluations/`.
- **Fix**: Add `finetune.py fetch-eval-results --job-id X` that downloads and saves:
  ```json
  {
    "job_id": "...", "status": "completed", "avg_score": 0.72,
    "scores_by_topic": {"protein-timing": 0.81, "meal-planning": 0.65},
    "low_scoring_records": [...]
  }
  ```
- **Files**: `finetune-skill/scripts/finetune.py`

### ISSUE-010: [FRICTION] consolidate_parts.py rewrites part IDs without warning
- **Impact**: MEDIUM — relations break if built before consolidation
- **Details**: `consolidate_parts.py` reassigns ALL part IDs to sequential `{doc-slug}-p-001`, `{doc-slug}-p-002`, etc. Original semantic IDs from extraction scripts are replaced. If relations.json is built before consolidation (using original IDs), it breaks.
- **Fix**: Already added warning to SKILL.md. Also consider: make consolidation preserve original IDs if they're unique, only reassign when there are conflicts.
- **Files**: `finetune-skill/SKILL.md` (done), `finetune-skill/scripts/consolidate_parts.py` (optional)

### ISSUE-011: [FRICTION] finetune.py upload-topics required topological ordering fix
- **Impact**: MEDIUM — hierarchical topics fail without the fix
- **Details**: Gateway requires parent topics to exist before children (FK constraint). Original `upload-topics` sent all topics in one POST, which fails for hierarchies.
- **Fix**: Already fixed in `finetune.py` — now uploads in rounds (roots first, then children). Verified working.
- **Files**: `finetune-skill/scripts/finetune.py` (done)

### ISSUE-012: [FRICTION] Topic ID collision across workflows
- **Impact**: MEDIUM — re-running pipeline with same topic names fails
- **Details**: Topic `id` is a global PRIMARY KEY. User-supplied IDs like "protein-science" collide across workflows.
- **Fix**: Already fixed in `finetune.py` — now auto-generates UUIDs, moves user IDs to `reference_id` (workflow-scoped). Verified working.
- **Files**: `finetune-skill/scripts/finetune.py` (done)

---

## Already Fixed (in this session)

| Issue | Fix | Status |
|-------|-----|--------|
| Topic ID collision | `finetune.py` auto-generates UUIDs, user IDs → reference_id | ✅ Done |
| Topological topic upload | `finetune.py` uploads roots first, then children | ✅ Done |
| Record topic resolution | `finetune.py upload-records` resolves ref_ids → UUIDs via SQLite | ✅ Done |
| Consolidation ID rewrite warning | Added warning to SKILL.md | ✅ Done |

## Priority Order for Remaining Fixes

1. **ISSUE-001 + ISSUE-002**: Rewrite `api-reference.md` from `http.rs` + clean all stale `/finetune/datasets` refs
2. **ISSUE-003**: Fix training job example in SKILL.md (add `job_type`)
3. **ISSUE-006**: Clarify data flow (no manual sync needed) in SKILL.md
4. **ISSUE-008 + ISSUE-009**: Add local job tracking to `finetune.py`
5. **ISSUE-004**: Fix gateway to return internal ID on job creation
6. **ISSUE-005 + ISSUE-007**: Clarify system_prompt location + API fields
