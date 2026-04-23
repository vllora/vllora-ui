# Skill E2E Test Notes

## Test Date: 2026-03-16

## Overview

Testing the vLLora finetune skill end-to-end to verify that data flows correctly from skill execution → gateway → UI visualization, particularly for **topic-knowledge relationships**.

## What Was Tested

### Test 1: Simulated API Calls (workflow `6eba03f8`)
- Created workflow, knowledge source with 6 parts, 9 topics, 8 relations, 12 records
- All data successfully pushed via curl
- UI verified: canvas badges, RecordsPanel source refs, KnowledgePartViewer backlinks all working

### Test 2: Real Skill Execution (workflow `5b40c69f`)
- Used `chess-tactics-and-combinations-dave-regis-646.pdf`
- Extracted 8 parts via `pymupdf` fallback
- Created 9 topics, 11 relations, 12 records
- Table view verified in browser — records grouped correctly under topics

### Test 3: Docling Serve Extraction (workflow `eeaeacf5`)
- Same PDF, extracted via **Docling Serve** (`docker run -p 5001:5001 quay.io/docling-project/docling-serve`)
- Docling produced 12.4MB output (including base64-encoded images), 84K chars of clean text
- Much richer section structure than pymupdf — proper headings, subsections, markdown tables
- Created 10 knowledge parts, 12 topics (5 parent + 7 leaf), 12 relations, 14 records
- Extraction took ~73 seconds on Apple Silicon (Docker ARM emulation)

## Issues Found Running the Skill

### 1. Skill Setup for Agent Execution
**Problem:** The SKILL.md needs to be in the project root for Claude Code to auto-detect it. Copying the skill content into `.claude/skills/` is not sufficient for standalone agent execution — the agent needs to be launched within the project context.

**Fix needed:** Document the correct setup:
```
test-project/
├── SKILL.md            # Root-level for auto-detection
├── CLAUDE.md           # Project instructions
├── chess-tactics.pdf   # Input document
└── .claude/
    └── skills/         # Reference docs (api-reference.md, etc.)
        └── reference/
```

### 2. PDF Extraction Dependency
**Problem:** The skill's primary extraction method (Docling Serve) requires a running Docling server. The fallback to `pymupdf`/`pdfplumber` requires pip-installing packages.

**Docling Serve setup:**
```bash
docker run -d --name docling-serve -p 5001:5001 quay.io/docling-project/docling-serve
# Health check: curl http://localhost:5001/health → {"status":"ok"}
# API endpoint: POST /v1/convert/file with multipart form field "files"
```

**Docling API notes:**
- Endpoint is `/v1/convert/file` (not `/api/v1/convert/file`)
- File field name is `files` (not `file`)
- Response shape: `{ document: { md_content, json_content, html_content, ... }, status, processing_time }`
- Extraction includes base64-encoded images — filter these for text-only parts
- Some OCR artifacts appear in headings (double-spaced characters), body text is clean

**Fallback recommendation:** Add explicit instructions for which Python PDF library to install:
```bash
pip3 install pymupdf  # or: pip3 install pdfplumber
```

### 3. Record Format: `id` Field Required
**Problem:** The `POST /records` endpoint requires an `id` field on each record. The skill documentation shows this correctly, but it's easy to miss when generating records programmatically.

**Record format:**
```json
{
  "id": "uuid-string",
  "data": {
    "input": {"messages": [...]},
    "output": {"messages": [...]}
  },
  "topic": "topic-id",
  "is_generated": true
}
```

### 4. Relations API Field Names
**Problem:** The relations POST endpoint uses `topic_identifier` and `part_identifier`, but the GET response returns `topic_id` and `source_part_id`. This naming mismatch can cause confusion.

| Operation | Topic field | Part field |
|-----------|------------|------------|
| POST (create) | `topic_identifier` | `part_identifier` |
| GET (read) | `topic_id` | `source_part_id` |

**Impact on UI:** The FE adapter (`api-dataset-adapter.ts`) uses the GET field names (`topic_id`, `source_part_id`) which is correct. But the skill SKILL.md and reference docs need to be clear about which names to use where.

### 5. API Request Body Must Be Wrapped Objects
**Problem:** The POST endpoints for topics, relations, and records do NOT accept raw JSON arrays. They expect a wrapper object:

| Endpoint | Wrapper key | Example |
|----------|-------------|---------|
| POST /topics | `topics` | `{"topics": [{...}, ...]}` |
| POST /topics/relations | `relations` | `{"relations": [{...}, ...]}` |
| POST /records | `records` | `{"records": [{...}, ...]}` |

Sending a raw array `[{...}]` returns: `"invalid type: map, expected a sequence"`.

### 6. Relations `topic_identifier` Requires Topic UUID, Not Identifier String
**Problem:** When creating topics with an `identifier` field (e.g., `"forks"`), this identifier is NOT stored or returned by the API. The `topic_identifier` in relations must be the **UUID** (`id`) of the topic, not the string identifier used during creation.

**Workflow:** Create topics first → GET topics to retrieve UUIDs → use UUIDs in relations.

### 7. Topic Descriptions Not Preserved
**Problem:** When uploading topics via `POST /topics`, the `description` field in the request body doesn't appear to be stored or returned. The canvas nodes show "No description" even when descriptions were provided in the upload.

**Impact:** Topic nodes on the canvas display "No description" instead of the descriptions provided during skill execution. This is a gateway-level issue — the `workflow_topics` table may not have a `description` column.

### 6. Records Show as "unassigned" Despite Having Topics
**Problem:** When records are uploaded with `topic: "openings-principles"` (topic ID), the record count in the explorer sidebar correctly groups them, but the internal topic matching may use topic names vs IDs differently.

**Root cause:** Records store topics by ID, but some UI components match by name. The existing code handles this with dual-lookup (`recordCountsByTopic[node.id] || recordCountsByTopic[node.name]`).

## Verified Working

| Feature | Status | Notes |
|---------|--------|-------|
| Workflow creation | Working | POST /finetune/workflows |
| Knowledge source upload | Working | POST with multipart form |
| Knowledge parts upload | Working | POST /knowledge/{ks_id}/parts |
| Topics upload | Working | POST /topics with `{"topics": [...]}` wrapper |
| Topic relations upload | Working | POST /topics/relations |
| Records upload | Working | POST /records with correct format |
| Phase 0: Relations merge | Working | FE fetches GET /topics/relations, merges into sourceChunkRefs |
| Phase 1: Source refs in panel | Working | Collapsible section with grouped parts |
| Phase 2: Canvas badges | Working | "N source(s)" with color coding |
| Phase 3A: Backlinks | Working | "Referenced by" topic badges in KnowledgePartViewer |
| Docling Serve extraction | Working | High-quality structured markdown with headings, tables, images |
| Docling → Gateway pipeline | Working | Docling output → structured parts → POST /parts |

## Recommendations for Skill Improvement

1. **Add relation-builder validation**: The skill's relation-builder subagent should verify that `part_identifier` values match actual part `reference_id` values from the uploaded parts.

2. **Add verification step**: After pushing all data, the skill should call GET endpoints to verify counts match expected values (topics, parts, relations, records).

3. **Add description support**: Either add a `description` column to `workflow_topics` table, or store descriptions in the `source_chunk_refs` JSON column alongside other metadata.
