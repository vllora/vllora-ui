# Documentation Audit Report

**Date**: 2026-03-19
**Source of truth**: `finetune-skill/SKILL.md` + `finetune-skill/scripts/` + `finetune-skill/templates/`
**Docs audited**: `docs/workflow-skill-first-approach/how-skill-work/` + `skill-testing-guide.md`

---

## 1. pipeline-overview.md

### OUTDATED Issues

**1.1. Steps 7-9 numbering and flow do not match SKILL.md** (lines 15-17)
- **Doc says**: Step 7 = Evaluation, Step 8 = Analyze & Iterate, Step 9 = Train & Iterate (sequential, all optional)
- **SKILL.md says**: Step 7 = Start Evaluation & Training (parallel), Step 8 = Analyze Results & Present Findings, Step 9 = Iterate (If Needed)
- **Key difference**: SKILL.md runs eval AND training in parallel on first run (Step 7a + 7b). The doc treats training as a separate late step (Step 9) done only after analysis.
- **Severity**: OUTDATED
- **Fix**: Rewrite Steps 7-9 to match SKILL.md's parallel eval+training flow. Step 7 starts both jobs simultaneously. Step 8 analyzes both sets of results interactively. Step 9 iterates based on user choice.

**1.2. Step 7 description omits training and the `--no-wait` pattern** (lines 540-558)
- **Doc says**: Step 7 only covers evaluation via `run_evaluation.py`.
- **SKILL.md says**: Step 7 creates both eval AND training jobs, polls both, saves results for each.
- **Note**: `run_evaluation.py` does NOT support `--no-wait` (the flag is referenced in SKILL.md line 571 but not implemented in the script). This is an issue in SKILL.md itself, but the doc should not propagate it.
- **Severity**: OUTDATED
- **Fix**: Add training job creation (direct curl to `POST /finetune/workflows/{id}/jobs`) and parallel polling. Note that `--no-wait` is not an actual flag in `run_evaluation.py`.

**1.3. Step 9 describes training-monitor subagent but not the interactive analysis flow** (lines 586-656)
- **Doc says**: Step 9 starts training via direct curl, spawns training-monitor subagent, handles anomalies.
- **SKILL.md says**: Step 8 presents analysis interactively to the user and lets them choose the next action. Step 9 applies fixes based on user choice and starts new jobs.
- **Severity**: OUTDATED
- **Fix**: Rewrite to show the interactive analysis + iteration pattern from SKILL.md Steps 8-9.

**1.4. Step 6 description says "upload everything"** (line 587)
- **Doc line 587 says**: `Step 6: Upload everything to gateway      (fast — API calls)`
- **SKILL.md says**: Step 6 just verifies (each prior step already uploaded). The doc's own body text (line 507) correctly says "Step 6 just verifies" but the execution flow table (line 587) contradicts this.
- **Severity**: OUTDATED
- **Fix**: Change line 587 to `Step 6: Verify all data in gateway (fast — single script call)`.

**1.5. Helper scripts table lists `start_training.py` at Step 9** (line 53)
- **Doc says**: `start_training.py` is used at Step 9.
- **SKILL.md says**: Step 7b starts training via direct curl, not `start_training.py`. The script exists but SKILL.md doesn't reference it for the pipeline.
- **Severity**: MINOR
- **Fix**: Note that SKILL.md uses direct curl for training job creation, though `start_training.py` is available as an alternative.

**1.6. Step 2f sub-step numbering skips 2b** (lines 141-329)
- **Doc labels**: 2a-2b, 2c, 2d, 2e, 2f
- **SKILL.md labels**: 2a, 2c, 2d, 2e, 2f (also skips 2b)
- **Issue**: Both doc and SKILL.md skip "2b" in the sub-step numbering. This is consistent but confusing — there is no Step 2b.
- **Severity**: MINOR
- **Fix**: Either add a 2b label for the Docling result processing or renumber to 2a-2e sequentially.

### MISSING Issues

**1.7. Missing `analysis-strategy.md` reference**
- **SKILL.md says**: "Read `reference/analysis-strategy.md` before analyzing" (Step 8). The file exists at `finetune-skill/reference/analysis-strategy.md`.
- **Doc**: Does not mention this reference file in the Step 8 section or the helper scripts table.
- **Severity**: MISSING
- **Fix**: Add `analysis-strategy.md` to the reference list and mention it in Step 8.

**1.8. Missing `knowledge-parts-schema.json` from reference list**
- **Actual reference dir** contains `knowledge-parts-schema.json` (JSON schema for knowledge_parts.json).
- **Doc and SKILL.md reference table**: Neither mentions it.
- **Severity**: MINOR
- **Fix**: Add to the reference file listing if desired.

**1.9. Missing `--force` flag on upload-knowledge example** (line 323)
- **SKILL.md** (line 364): Shows `--force` flag on `upload-knowledge` for safe re-uploads via PUT upsert.
- **Doc** (line 323): Shows `upload-knowledge` without `--force`.
- **Severity**: MISSING
- **Fix**: Add `--force` flag to the upload example and explain the PUT upsert behavior.

**1.10. Missing `--description` and `--metadata` flags on upload-knowledge example** (line 323)
- **SKILL.md** shows `--description` and `--metadata` flags.
- **Doc** omits them.
- **Severity**: MINOR
- **Fix**: Add optional flags to the example.

---

## 2. extraction-deep-dive.md

### OUTDATED Issues

**2.1. Flow diagram shows `--batch mode` for both Docling and pdftotext** (lines 21, 35)
- **Doc diagram**: Shows `docling_extract.py (--batch mode)` and `pdftotext_extract.py (--batch mode)` as the primary flow.
- **SKILL.md**: Explicitly recommends individual processing per document, NOT batch mode. SKILL.md says: "Use `--batch` only if all documents are similar size." The default flow processes each PDF end-to-end individually.
- **Severity**: OUTDATED
- **Fix**: Update the flow diagram to show individual document processing as the primary path, with batch mode as an alternative note.

**2.2. Debugging section shows pdftotext with `--batch` as default** (lines 247-253)
- **Doc says**: Shows `uv run scripts/pdftotext_extract.py --batch` as the debugging example.
- **SKILL.md**: Shows both individual and batch mode for pdftotext, with individual mode first.
- **Severity**: MINOR
- **Fix**: Show individual mode first, batch as alternative.

### MISSING Issues

**2.3. Missing the content quality assessment step (Step 2e from SKILL.md)**
- **SKILL.md Step 2e**: Assesses whether each document's content is suitable for training data generation, with a teaching keyword check and a <10% warning threshold.
- **Doc**: Does not mention content quality assessment at all. Goes from consolidation directly to merge/verify.
- **Severity**: MISSING
- **Fix**: Add a section for content quality assessment between consolidation and verification.

**2.4. Missing `validate_extraction.py` with `--fix` flag details**
- **SKILL.md Step 2f**: Shows `validate_extraction.py --fix` to auto-run consolidation on failing documents.
- **Doc** (line 286-291): Shows `validate_extraction.py --fix` but doesn't explain what `--fix` does internally (runs `consolidate_parts.py` on failing documents).
- **Severity**: MINOR
- **Fix**: Add brief explanation of what `--fix` does.

**2.5. Missing the `--force` flag on `upload-knowledge` example** (line 221-226)
- **SKILL.md**: Shows `--force` for PUT upsert on re-uploads.
- **Doc**: Shows basic `upload-knowledge` without `--force`.
- **Severity**: MISSING
- **Fix**: Add `--force` flag and explain the upsert behavior.

---

## 3. generate-topics-deep-dive.md

### OUTDATED Issues

No significant outdated issues found. The document is well aligned with SKILL.md Step 3.

### MISSING Issues

**3.1. Missing mention of `reference/topic-hierarchy.md` as a reference**
- **SKILL.md Step 3**: "See `reference/topic-hierarchy.md` for design guidelines."
- **Doc**: Does not reference this file.
- **Severity**: MINOR
- **Fix**: Add a pointer to the reference doc.

---

## 4. generate-records-deep-dive.md

### OUTDATED Issues

**4.1. Missing `generate_records.py` script usage** (lines 96-109)
- **Doc says**: The agent calls `chat_completion.py` directly as described in a manual process. Shows `uv run scripts/chat_completion.py` reading from stdin.
- **SKILL.md Step 4**: Uses `scripts/generate_records.py` as the primary method, which internally calls `chat_completion.py`. The script automates the full loop (load topics, find leaves, gather parts, generate per topic).
- **Severity**: OUTDATED
- **Fix**: Replace the manual `chat_completion.py` description with `generate_records.py` as the primary approach. Show the full CLI: `uv run scripts/generate_records.py --topics ... --relations ... --knowledge-dir ... --system-prompt ... --output ... --records-per-topic 10`. Mention that `chat_completion.py` is the underlying LLM call mechanism.

**4.2. Missing `--append` flag documentation**
- **SKILL.md Step 4**: "If some topics fail, use `--append` to retry only the missing ones."
- **Script**: `generate_records.py` supports `--append` flag.
- **Doc**: Does not mention `--append` for retry of failed topics.
- **Severity**: MISSING
- **Fix**: Add documentation for the `--append` flag.

---

## 5. chess-pdf/README.md

### Issues

**5.1. No significant issues found**
- The document is a reference evaluation of PDFs, not a pipeline description. It accurately describes the chess PDFs, their qualities, and recommendations.
- One minor note: It references "0.987 avg eval score" for the Dave Regis book. If this was from an older pipeline version, the number may no longer be accurate, but it's labeled as a tested result so it's not wrong per se.
- **Severity**: N/A (informational content, not implementation docs)

---

## 6. skill-testing-guide.md

### OUTDATED Issues

**6.1. Skill file copy paths reference `.claude/` destination** (lines 47-52)
- **Doc says**: Copy scripts to `$TEST_DIR/.claude/scripts/` and templates to `$TEST_DIR/.claude/templates/`.
- **SKILL.md working directory spec**: References `scripts/` (not `.claude/scripts/`).
- **Note**: This is intentional for the testing setup (skills are placed in `.claude/` when installed), so the paths differ from SKILL.md's relative references. This is correct for the test setup but means the example commands in the testing guide (e.g., `uv run .claude/scripts/finetune.py`) differ from SKILL.md (which says `uv run scripts/finetune.py`).
- **Severity**: MINOR (intentional but worth noting)

**6.2. Option A prompt suggests `--batch mode` for Docling** (line 109)
- **Doc says**: "Extract ALL PDF documents using docling_extract.py (with --batch mode)"
- **SKILL.md**: Recommends individual extraction per document, not batch. Says "Use `--batch` only if all documents are similar size."
- **Severity**: OUTDATED
- **Fix**: Remove "(with --batch mode)" or change to "Extract ALL PDF documents using docling_extract.py (processing each individually)".

**6.3. Steps 7-9 not covered in the execution flow table** (lines 577-588)
- **Doc execution flow table**: Shows Steps 1-6 and then vaguely mentions "Step 7-9: Evaluation/Training/Deployment (optional, external services)".
- **SKILL.md**: Steps 7-9 are well-defined with parallel eval+training, interactive analysis, and iteration. They are part of the pipeline, not just "external services".
- **Severity**: OUTDATED
- **Fix**: Expand the execution flow section to cover Steps 7-9 with the parallel eval+training pattern from SKILL.md.

**6.4. Missing `--no-wait` note on `run_evaluation.py` command** (line 350)
- **Doc says**: `uv run .claude/scripts/run_evaluation.py --dataset-id $WF_ID --output evaluations/eval-v1.json --limit 10`
- **SKILL.md Step 7a**: Shows `--no-wait` flag, but this flag does NOT exist in `run_evaluation.py`.
- **Severity**: MINOR (the doc doesn't propagate the SKILL.md error, which is good)

### MISSING Issues

**6.5. Missing `generate_records.py` in manual testing section** (lines 130-169)
- **Doc Step 4 (manual)**: Shows only `finetune.py upload-records` but doesn't show how to generate records via `generate_records.py`.
- **Severity**: MISSING
- **Fix**: Add `generate_records.py` usage before the upload step in the manual testing section.

**6.6. Missing the `--force` flag on `upload-knowledge` in manual testing**
- The manual testing section doesn't show `--force` for re-uploads.
- **Severity**: MINOR

**6.7. Deleted templates not cleaned from copy command** (line 51)
- **Doc says**: `cp -r "$SKILL_DIR/templates" "$TEST_DIR/.claude/"`
- **Templates dir now only contains**: `grader-template.js`. The previously existing `extract-sections.py`, `project-config.json`, and `sample-conversation.jsonl` have been deleted (per git status).
- **Issue**: The copy command still works (it copies whatever is there), but any doc text referencing the old templates would be wrong. No such references were found in the docs.
- **Severity**: N/A (no broken references, just fewer files)

---

## 7. Cross-Cutting Issues (affect multiple docs)

### OUTDATED

**7.1. `--no-wait` flag referenced in SKILL.md but doesn't exist in `run_evaluation.py`**
- **SKILL.md line 571**: `uv run scripts/run_evaluation.py --dataset-id $WORKFLOW_ID --output evaluations/eval-v1.json --no-wait`
- **Actual script**: No `--no-wait` flag exists in `run_evaluation.py`. The script always polls until complete.
- **Severity**: OUTDATED (in SKILL.md itself)
- **Fix**: Either implement `--no-wait` in the script or remove the flag from SKILL.md.

**7.2. Parallel eval+training pattern not reflected in any docs**
- **SKILL.md Step 7**: Clearly describes starting both eval and training simultaneously, polling both, saving results for each.
- **All docs**: Treat eval and training as separate sequential steps.
- **Severity**: OUTDATED
- **Fix**: Update pipeline-overview.md, skill-testing-guide.md to describe the parallel flow.

### MISSING

**7.3. No doc mentions `analysis-strategy.md` reference file**
- The file exists at `finetune-skill/reference/analysis-strategy.md` and is referenced by SKILL.md Step 8.
- None of the how-skill-work docs mention it.
- **Severity**: MISSING
- **Fix**: Add to pipeline-overview.md helper scripts/reference table.

**7.4. `start_training.py` script not documented in any deep-dive**
- The script exists and is listed in pipeline-overview.md's helper table (line 53), but no deep-dive explains its CLI args or usage.
- **SKILL.md** uses direct curl for training, not this script. But the script is available as an alternative.
- **Severity**: MINOR
- **Fix**: Either document it or note that SKILL.md uses direct curl instead.

---

## Summary

| Doc | OUTDATED | MISSING | MINOR | Total |
|-----|----------|---------|-------|-------|
| pipeline-overview.md | 4 | 4 | 2 | 10 |
| extraction-deep-dive.md | 1 | 3 | 1 | 5 |
| generate-topics-deep-dive.md | 0 | 1 | 0 | 1 |
| generate-records-deep-dive.md | 1 | 1 | 0 | 2 |
| chess-pdf/README.md | 0 | 0 | 0 | 0 |
| skill-testing-guide.md | 2 | 2 | 3 | 7 |
| Cross-cutting | 2 | 2 | 0 | 4 |
| **Total** | **10** | **13** | **6** | **29** |

### Top Priority Fixes

1. **Steps 7-9 mismatch** (pipeline-overview.md + skill-testing-guide.md): The parallel eval+training flow from SKILL.md is not reflected anywhere. This is the biggest gap.
2. **Batch vs individual extraction** (extraction-deep-dive.md + skill-testing-guide.md): Docs default to `--batch` mode; SKILL.md defaults to individual processing.
3. **`generate_records.py` not documented** (generate-records-deep-dive.md): The deep-dive describes a manual process instead of the actual script.
4. **`--no-wait` flag doesn't exist** (SKILL.md itself): The flag is referenced but not implemented in `run_evaluation.py`.
5. **`--force` flag missing from upload examples** (pipeline-overview.md + extraction-deep-dive.md): The PUT upsert behavior is not shown.

---

## Re-Audit Results

**Date**: 2026-03-19
**Auditor**: Automated re-verification of all 29 issues against current file state.

### 1. pipeline-overview.md

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1.1 | Steps 7-9 numbering and flow do not match SKILL.md | **FIXED** | Steps 7-9 now match SKILL.md: Step 7 = parallel eval+training, Step 8 = analyze & present, Step 9 = iterate. Pipeline glance table (lines 15-17) and full sections (lines 542-754) all align. |
| 1.2 | Step 7 description omits training and `--no-wait` | **FIXED** | Step 7 now has 7a (eval), 7b (training with full curl example), 7c (poll both). `--no-wait` correctly omitted (flag removed from SKILL.md too). |
| 1.3 | Step 9 describes training-monitor subagent | **FIXED** | Step 9 now describes the interactive analysis + iteration pattern. Subagents table (line 67) explicitly notes "there is no separate training-monitor subagent." |
| 1.4 | Step 6 description says "upload everything" | **FIXED** | Line 509 now says "Step 6 just verifies everything landed correctly." Execution flow table (line 608) says "Verify all data in gateway". |
| 1.5 | Helper scripts table lists `start_training.py` at Step 9 | **FIXED** | Line 53 now lists `start_training.py` at Step 7b with note "(alternative to direct curl used by SKILL.md)". |
| 1.6 | Step 2f sub-step numbering skips 2b | **FIXED** | Sub-steps are now 2a-2b, 2c, 2d, 2e, 2f — the 2a-2b label groups extraction submission and processing together. Consistent with SKILL.md. |
| 1.7 | Missing `analysis-strategy.md` reference | **FIXED** | Line 637 references `analysis-strategy.md` in the Step 8 section. |
| 1.8 | Missing `knowledge-parts-schema.json` from reference list | **NOT FIXED** | Still not mentioned in the helper scripts/reference table. However, this was marked MINOR and SKILL.md itself also does not reference it, so this is by design. |
| 1.9 | Missing `--force` flag on upload-knowledge example | **FIXED** | Line 327 shows `--force` flag. Line 330 explains the PUT upsert behavior. |
| 1.10 | Missing `--description` and `--metadata` flags | **PARTIALLY FIXED** | The pipeline-overview.md upload-knowledge example (line 322-328) does not show `--description` or `--metadata`. However, extraction-deep-dive.md (line 258-261) does show both flags with full examples. The pipeline overview is intentionally brief. |

### 2. extraction-deep-dive.md

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 2.1 | Flow diagram shows `--batch mode` for Docling | **FIXED** | Flow diagram (lines 20-22) now shows "per document, process individually" for Docling path. Note on line 59 explains batch mode as alternative only when documents are similar size. |
| 2.2 | Debugging section shows pdftotext with `--batch` as default | **FIXED** | Debugging section (lines 286-297) now shows single document mode first ("recommended"), batch as alternative. |
| 2.3 | Missing content quality assessment step (Step 2e) | **FIXED** | New section "Content Quality Assessment (Step 2e)" at lines 175-201 with the teaching keyword check and <10% warning threshold. |
| 2.4 | Missing `validate_extraction.py` with `--fix` flag details | **FIXED** | Lines 333-336 show `--fix` usage. Line 298 mentions running `consolidate_parts.py` and `validate_extraction.py` after pdftotext. The flow diagram (line 48) includes `validate_extraction.py`. |
| 2.5 | Missing `--force` flag on upload-knowledge example | **FIXED** | Lines 258-263 show full upload example with `--force`, `--description`, and `--metadata` flags, with explanation of PUT upsert behavior. |

### 3. generate-topics-deep-dive.md

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 3.1 | Missing mention of `reference/topic-hierarchy.md` | **FIXED** | Line 251 references the file: "see `finetune-skill/reference/topic-hierarchy.md`." |

### 4. generate-records-deep-dive.md

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 4.1 | Missing `generate_records.py` script usage | **FIXED** | Lines 96-130 now show `generate_records.py` as the primary method with full CLI example, explanation of what the script does internally, and how it calls `chat_completion.py`. |
| 4.2 | Missing `--append` flag documentation | **FIXED** | Lines 118-128 document the `--append` flag with a full CLI example for retrying failed topics. |

### 5. chess-pdf/README.md

No issues in original audit. No re-check needed.

### 6. skill-testing-guide.md

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 6.1 | Skill file copy paths reference `.claude/` destination | **N/A** | This was marked MINOR and intentional — test setup uses `.claude/` paths. No change needed. |
| 6.2 | Option A prompt suggests `--batch mode` for Docling | **FIXED** | Line 109 now says "processing each individually" instead of "(with --batch mode)". |
| 6.3 | Steps 7-9 not covered in execution flow table | **FIXED** | Execution flow table (lines 599-611) now includes Step 7 (parallel eval+training), Step 8 (interactive analysis), Step 9 (iterate with max 5 iterations). |
| 6.4 | Missing `--no-wait` note on `run_evaluation.py` | **N/A** | The doc correctly does not propagate the SKILL.md error. The `--no-wait` flag has also been removed from SKILL.md, so this issue is fully resolved. |
| 6.5 | Missing `generate_records.py` in manual testing section | **FIXED** | Lines 167-174 show `generate_records.py` usage in the manual testing section with full CLI example. |
| 6.6 | Missing `--force` flag on `upload-knowledge` in manual testing | **FIXED** | Lines 146-157 show the manual testing upload loop with `--force` flag and a comment explaining "use --force for safe re-uploads via PUT upsert". |
| 6.7 | Deleted templates not cleaned from copy command | **N/A** | The copy command still works (copies whatever exists). No broken references found. |

### 7. Cross-Cutting Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 7.1 | `--no-wait` flag referenced in SKILL.md but doesn't exist | **FIXED** | The `--no-wait` flag has been removed from SKILL.md. No docs propagate it. |
| 7.2 | Parallel eval+training pattern not reflected in any docs | **FIXED** | Both pipeline-overview.md (Steps 7-9 sections) and skill-testing-guide.md (execution flow table) now describe the parallel flow. |
| 7.3 | No doc mentions `analysis-strategy.md` reference file | **FIXED** | pipeline-overview.md Step 8 section (line 637) now references it. |
| 7.4 | `start_training.py` script not documented in any deep-dive | **PARTIALLY FIXED** | Listed in pipeline-overview.md helper table (line 53) with note that SKILL.md uses direct curl. No deep-dive doc exists, but this was MINOR severity. |

### Summary

| Status | Count |
|--------|-------|
| **FIXED** | 24 |
| **PARTIALLY FIXED** | 2 |
| **NOT FIXED** | 1 |
| **N/A** (intentional/no-change-needed) | 2 |
| **Total** | 29 |

**Remaining items (all MINOR severity):**
- **1.8** `knowledge-parts-schema.json` not in reference list — by design, SKILL.md also omits it
- **1.10** `--description`/`--metadata` flags not in pipeline-overview.md upload example — covered in extraction-deep-dive.md instead
- **7.4** `start_training.py` lacks a deep-dive — listed in helper table with note about SKILL.md using direct curl

### New Issues Found

No new issues were found. The fixes are clean — no merge conflicts, no broken formatting, no new inconsistencies introduced. All documents are internally consistent and aligned with the current SKILL.md.
