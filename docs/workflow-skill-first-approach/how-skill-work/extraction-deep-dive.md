# How Document Extraction Works — Deep Dive

The extraction step (Step 2) is the most complex and time-consuming part of the skill pipeline. This document explains exactly what happens, what data flows where, and how each piece connects to the rest of the pipeline.

## Why Extraction Matters

The skill generates training data **grounded in source documents**. Without extraction, the agent can only generate generic prompts from the objective description. With extraction, every training record can reference specific passages, tables, and figures from the source material — making the training data more accurate and traceable.

## The Extraction Flow

```
                     PDF documents
                          │
                          ▼
                   extract_router.py
                   (is_digital_pdf ?)
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
           (digital)            (scanned)
                │                   │
                ▼                   ▼
        odl_extract.py      docling_extract.py
        (local, Java-based, (Docker, async
         deterministic)      submit/poll)
                │                   │
                └─────────┬─────────┘
                          ▼
              extraction-result.json
              (ODL kids[] OR Docling chunks[])
              extraction-status.json
              (backend, used_struct_tree, pages)
                          │
                          ▼
              build_knowledge_parts.py
              (sniffs input shape, heading-aware
               splitting, emits semantic_type /
               heading_level / parent_section /
               tag_source metadata)
                          │
                          ▼
              consolidate_parts.py
              content quality check
                          │
                          ▼
              knowledge_parts.json
              + parts-index.json
              (per document)
                          │
                          ▼
              validate_extraction.py
                          │
              all-parts-index.json  (merged)
                          │
                  ┌───────┼───────┐
                  ▼       ▼       ▼
              Step 3:  Step 4:  Upload
              Topic    Data     (incremental,
              Design   Generation after Step 2)

(fallback: pdftotext_extract.py, when neither ODL nor Docling available —
 writes knowledge_parts.json directly, loses tables/images/layout)
```

> **Note on batch mode**: `extract_router.py --batch` groups PDFs by backend and issues one ODL JVM call for all digital PDFs plus parallel Docling submissions for scanned ones. This is usually the fastest path. For mixed corpora where a single large scanned PDF would block the batch, you can process individually.

## What the router does

`extract_router.py` is the single entry point. It auto-routes each PDF by calling `is_digital_pdf()` (a cheap pdftotext sample) and dispatches:

- **Digital PDFs → OpenDataLoader (ODL)** — local Java-based extraction via `odl_extract.py`. Byte-identical reruns, no Docker, no async polling. Consumes the tagged-PDF structure tree when available (falls back to XY-Cut++ layout otherwise).
- **Scanned PDFs → Docling Serve** — OCR-capable async service via `docling_extract.py`. Retained as the fallback path.

The router writes `extraction-status.json` alongside every `extraction-result.json` recording which backend ran, whether the structure tree was consumed, page/element counts, and duration. Downstream scripts (notably `build_knowledge_parts.py`) sniff the result shape directly (`kids[]` → ODL, `chunks[]` → Docling) rather than reading the status file — it's there for humans and debugging.

### What ODL does (primary, digital-PDF path)

OpenDataLoader PDF is a local Java-based extractor:
- **Tagged-PDF aware** — consumes the PDF structure tree when `use_struct_tree=True` for semantic headings/lists/tables; falls back to XY-Cut++ visual layout analysis otherwise
- **Deterministic** — same input → byte-identical output across runs (the key win over Docling's async pipeline)
- **Table detection** — `table_method="cluster"` gives better accuracy than the default
- **No OCR** — scanned PDFs must go to Docling instead (the router handles this automatically)
- **No chunking** — ODL emits a flat `kids[]` tree in reading order; `build_knowledge_parts.py` owns the heading-aware chunking

### What Docling does (OCR fallback, scanned-PDF path)

Docling Serve remains the fallback when `is_digital_pdf()` returns false:
- **OCR on scanned pages**
- **Auto-detects** digital vs scanned (also used by `is_digital_pdf()` internally)
- **Detects and extracts table structure** (rows, columns, headers)
- **Extracts embedded images**
- **Produces `chunks[] + documents[0].content.json_content`** — the response schema documented below

#### Docling API Endpoints (internal to `docling_extract.py`)

The router calls `docling_extract.py` — agents must NOT call these endpoints directly via curl. The script handles the full async lifecycle (submit → poll → fetch → auto-detect OCR). Internally it calls:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check if Docling is running (router checks this only when a scanned PDF is routed) |
| `/v1/chunk/hybrid/file/async` | POST | Submit a document for processing (returns `task_id`). Uses `chunking_max_tokens=8192` as safety ceiling |
| `/v1/status/poll/{task_id}` | GET | Check if processing is complete |
| `/v1/result/{task_id}` | GET | Fetch the processed result |

### ODL Response Structure (primary path)

For digital PDFs, `extraction-result.json` is a flat `kids[]` tree in reading order:

```json
{
  "file name": "document.pdf",
  "number of pages": 12,
  "author": null,
  "title": null,
  "kids": [
    {
      "type": "heading",
      "id": 1,
      "page number": 1,
      "bounding box": [72.0, 720.0, 523.0, 742.0],
      "font": "Helvetica-Bold",
      "font size": 14,
      "content": "1 Introduction",
      "heading level": 1
    },
    {
      "type": "paragraph",
      "id": 2,
      "page number": 1,
      "bounding box": [72.0, 600.0, 523.0, 715.0],
      "content": "The dominant sequence transduction models are based on..."
    }
  ]
}
```

Key points:
- **Flat tree** — `kids[]` is already in XY-Cut++ reading order; no tree walk needed
- **`type`** — `"paragraph" | "heading" | "image" | "table" | "list_item" | "caption" | "header" | "footer"` (headers/footers are filtered as noise)
- **`bounding box`** — `[l, b, r, t]` in PDF points, bottom-left origin. `build_knowledge_parts.py` translates this into the `{page, l, t, r, b, coord_origin: "BOTTOMLEFT"}` shape consumed by `PdfHighlightViewer`.
- **`heading level`** — 1..6 when present. Presence indicates the tagged-PDF structure tree was consumed (`tag_source: "structure_tree"`); absence means XY-Cut++ layout fallback (`tag_source: "xycut_fallback"`).
- **Field names contain spaces** (e.g. `"page number"`, `"bounding box"`) — not a typo

### Docling Response Structure (fallback path)

The response from `/v1/result/{task_id}` is a large JSON object with two main sections:

```json
{
  "chunks": [
    {
      "text": "Chapter 3: Tactical Motifs\nThe fork is...",
      "headings": ["3 Tactical Motifs"],
      "page_numbers": [42],
      "doc_items": ["#/texts/115"],
      "chunk_index": 20,
      "num_tokens": 200
    }
  ],
  "documents": [
    {
      "content": {
        "json_content": {
          "texts": [...],        // All text elements
          "tables": [...],       // Extracted tables with cell structure
          "pictures": [...],     // Embedded images (base64)
          "pages": {...},        // Full-page renders
          "body": {...}          // Document tree structure
        }
      }
    }
  ]
}
```

**Key insight**: `chunks[]` gives you text with headings and page numbers, but `documents[].content.json_content` gives you tables, images, and the document tree. The extraction script needs **both**.

### Why Docling Results Are So Large

A 100-page PDF can produce a 30-50MB Docling result because:
- Full-page renders (`pages{}`) are base64-encoded PNG images
- Embedded images (`pictures[]`) are also base64
- Every text element has metadata (bounding boxes, provenance)
- Tables have full cell structure

This is why the agent can struggle with Step 2c — reading a 36MB JSON into its context window is expensive.

## From Extraction Result to Knowledge Parts

The extraction uses `build_knowledge_parts.py` — a **deterministic script** that sniffs the input shape (ODL `kids[]` vs Docling `chunks[]`) and transforms raw extraction output into structured, typed parts with provenance metadata. The same input always produces the same output, eliminating the non-determinism that caused flaky extraction across runs.

> **History**:
> - **2026-03-31** — Previously, subagents wrote custom extract.py scripts per document, causing different output on every run. Default became `build_knowledge_parts.py` for all documents.
> - **2026-04** — Docling HybridChunker replaced by OpenDataLoader (ODL) as the primary extractor. `build_knowledge_parts.py` now owns all chunking (heading-aware grouping). Docling kept as OCR fallback. Custom scripts are only written when the user provides explicit CUSTOM_INSTRUCTIONS or the deterministic script produces 0 parts.

### What `build_knowledge_parts.py` Does

```python
# Deterministic pipeline — same input always produces same output

1. Load extraction-result.json
2. Sniff input shape:
   - "kids" in data and "chunks" not in data → ODL branch
   - "chunks" in data                        → Docling branch

ODL branch (primary):
  3a. Iterate kids[] in order; filter header/footer noise
  3b. Maintain heading stack; on each heading, close the current section
      and open a new one (breadcrumb goes into parent_section)
  3c. Within a section, group paragraphs/list_items/tables into parts
      respecting MIN/TARGET/MAX_PART_CHARS budgets
  3d. Tables emit as their own parts regardless of size; images as image parts
  3e. Translate bboxes: [l, b, r, t] + page_number →
      {page, l, t, r, b, coord_origin: "BOTTOMLEFT"}
  3f. Attach metadata: semantic_type, heading_level, parent_section,
      tag_source ("structure_tree" | "xycut_fallback")

Docling branch (fallback):
  3a. Filter noise (TOC, copyright, blank pages, chunks <20 chars)
  3b. Classify chunks by type (text / table via pipe lines / image via captions)
  3c. Split oversized chunks (>3000 chars) at paragraph/sentence boundaries
  3d. Merge undersized chunks (<100 chars) with neighbors
  3e. Resolve doc_item pointers for bboxes
  3f. Attach metadata: tag_source ("docling")

4. Assign IDs: {doc-slug}-{heading-slug}[-partN]
5. Write knowledge_parts.json + parts-index.json
```

### When Custom Extraction Is Needed

Custom extract.py is only appropriate when:
- `build_knowledge_parts.py` produces 0 parts (unusual document structure)
- The user provides CUSTOM_INSTRUCTIONS (e.g., "split fee schedule into individual items")
- Domain-specific content needs special handling (e.g., chess font parsing, music notation)

### Post-Extraction Consolidation

After the extraction script produces `knowledge_parts.json`, run `scripts/consolidate_parts.py` to improve quality:

```bash
uv run scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
```

**What it does**:
1. **Merges adjacent text parts** sharing the same `extraction_path` — reduces fragmentation from Docling's chunking
2. **Drops short fragments** — text parts under 50 chars (configurable via `--min-chars`) are removed
3. **Fixes Unicode escapes** — decodes `\u0xxx` sequences caused by `json.dumps(ensure_ascii=True)`
4. **Reassigns IDs** — sequential IDs with document-slug prefix (e.g., `chess-tactics-p-001`)
5. **Regenerates `parts-index.json`** — lightweight index updated to match consolidated parts
6. **Validates quality** — reports parts/page ratio, title diversity, avg content length

**Why this is needed**: Docling's HybridChunker produces many small fragments (known issue — see Docling GitHub #1207, #1174). A 100-page PDF can produce 1000+ tiny parts; consolidation reduces this to 30-80 meaningful parts.

**Encoding rule**: When writing `knowledge_parts.json`, always use `json.dump(..., ensure_ascii=False)` to preserve non-ASCII characters (Cyrillic, CJK, accented Latin). Without this, characters become `\u0xxx` escape sequences that pollute extraction paths and titles.

### Content Quality Assessment (Step 2e)

After extraction and consolidation, assess whether each document's content is suitable for training data generation. Not all PDFs are equally useful — a document full of move notation or reference tables produces worse training data than one with explanatory prose.

**Quick content quality check** (run per document after extraction):
```bash
python3 -c "
import json, re
d = json.load(open('$DOC_DIR/knowledge_parts.json'))
parts = d.get('parts', [])
# Count parts with teaching/explanatory content (2+ teaching keywords)
teaching_kw = ['explain', 'because', 'reason', 'strategy', 'concept', 'important', 'principle', 'technique', 'understand', 'learn']
good = sum(1 for p in parts if sum(1 for kw in teaching_kw if kw in p.get('content','').lower()) >= 2)
total = len(parts)
print(f'Teaching-quality parts: {good}/{total} ({good/max(total,1)*100:.0f}%)')
if good / max(total, 1) < 0.10:
    print('WARNING: <10% of parts have explanatory content. This document is mostly notation/data.')
    print('  Training data quality will be limited — consider adding a more expository document.')
else:
    print('OK: Document has sufficient explanatory content for quality training data.')
"
```

**What to do if a document scores <10%:**
- It's still usable for demo/testing — the LLM can synthesize questions from annotations
- For production quality, add a more explanatory document (textbook, tutorial, manual)
- Log the assessment in `extraction-notes.md` so downstream steps know what to expect

### Part Types

| Type | Content | Use in pipeline |
|------|---------|----------------|
| `text` | Prose passages, explanations, definitions | Main grounding material for training prompts |
| `table` | Structured data in markdown table format | Comparison/reference training scenarios |
| `image` | Base64 data URI of diagrams/figures | Visual context (stored but not used in text generation) |

### Part ID Naming

Part IDs must be unique across all documents. Prefix with a document identifier (typically the slugified filename or a short alias):

```
{doc-identifier}-{descriptive-slug}
```

Examples:
- `chess-tactics-chapter-3-tactical-motifs`
- `chess-tactics-table-common-fork-patterns`
- `strategy-guide-section-opening-principles`

## How Parts Connect to the Rest of the Pipeline

### Parts → Topics (Step 3)

The `all-parts-index.json` (lightweight, no full content) is read during topic design. The agent uses extraction paths and content previews to understand what material exists, then designs topics that cover the available content.

### Parts → Relations (Step 3)

The relation-builder subagent matches parts to topics:
```json
// relations.json
[
  {"topic_identifier": "forks", "part_identifier": "chess-tactics-chapter-3-tactical-motifs"},
  {"topic_identifier": "pins", "part_identifier": "chess-tactics-chapter-4-pins-and-skewers"}
]
```

### Parts → Training Records (Step 4)

During data generation, the agent reads full part content from `{doc-slug}/knowledge_parts.json` to ground the training prompts. Each record tracks which parts it was generated from:
```json
{"messages": [...], "id": "forks-001", "topic": "forks", "source_parts": ["chess-tactics-chapter-3-tactical-motifs"]}
```

### Parts → Gateway (uploaded immediately after Step 2)

Each document is uploaded as a separate **knowledge source** with its parts via `finetune.py`:

```bash
uv run scripts/finetune.py upload-knowledge \
  --workflow-id $WORKFLOW_ID \
  --file "chess-tactics.pdf" \
  --parts-file "knowledge/chess-tactics/knowledge_parts.json" \
  --name "chess-tactics.pdf" \
  --force \
  --description "Source document: chess-tactics.pdf" \
  --metadata '{"extraction_method":"odl","tag_source":"structure_tree"}'
```

The `--force` flag uses PUT upsert — it atomically replaces any existing source with the same name, making re-uploads safe after re-extraction. The `--description` and `--metadata` flags are optional but recommended for traceability.

The script handles the transformation: `id` → `reference_id`, removes `source_id`, then calls:
- `POST /workflows/{id}/knowledge` — creates the source (uploads the PDF file)
- `POST /workflows/{id}/knowledge/{ks_id}/parts` — uploads the structured parts

The gateway stores sources and parts in separate tables:
- `knowledge_sources` — one row per document
- `knowledge_source_parts` — one row per part, linked to its source

### Parts → UI Visualization

In the UI:
- **Sources view** — shows each document with its parts listed
- **Canvas view** — topic nodes show coverage bars based on how many parts are linked
- **Record detail** — shows which source parts a record was generated from

## Debugging Extraction Issues

### Neither ODL nor Docling available

If Java 11+ isn't installed (blocks ODL) **and** Docker isn't available (blocks Docling), fall back to `pdftotext_extract.py` — zero dependencies, but loses tables/images/layout:

Single document (recommended — process each individually):
```bash
uv run scripts/pdftotext_extract.py document.pdf \
  -o finetune-project/knowledge/doc-slug/knowledge_parts.json
```

Batch mode (alternative — all PDFs at once, use only if similar size):
```bash
uv run scripts/pdftotext_extract.py --batch \
  doc1.pdf:finetune-project/knowledge/doc1/knowledge_parts.json \
  doc2.pdf:finetune-project/knowledge/doc2/knowledge_parts.json
```
This skips the Docling step entirely and outputs `knowledge_parts.json` directly (no `docling-result.json`). Note: you lose tables, images, and complex layout — text only. Then run `consolidate_parts.py` and `validate_extraction.py` as usual.

### Agent stuck after producing `docling-result.json`

The Docling result is too large for the agent's context. Solutions:
- The agent should read chunks in batches (0-9, then 10-19, etc.) rather than loading the entire file
- The extraction script reads the file from disk, not from context — the agent only needs to understand the structure

### No `knowledge_parts.json` produced

The extraction script failed. Check:
1. Does the script exist? The agent writes it as a Python file
2. Did it error? Check the execution log for Python tracebacks
3. Is the Docling result valid JSON? `python3 -c "import json; json.load(open('chess-tactics/docling-result.json'))"`

### Parts have wrong IDs (no document prefix)

The agent didn't follow the multi-document naming convention. Parts from different documents will collide. Check:
```bash
# All part IDs should share a common prefix (typically the doc slug)
python3 -c "
import json
for p in json.load(open('knowledge/chess-tactics/knowledge_parts.json'))['parts']:
    if not p['id'].startswith('chess-tactics'):
        print(f'BAD ID: {p[\"id\"]}')
"
```

### Parts are too short or have duplicate titles

The extraction script didn't consolidate properly. Run the quality gate:
```bash
uv run scripts/validate_extraction.py finetune-project/knowledge/
```

If it reports FAIL, auto-fix with:
```bash
uv run scripts/validate_extraction.py finetune-project/knowledge/ --fix
```

Or consolidate a single document:
```bash
uv run scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
```

**Healthy thresholds**: 2-10 parts/page, title diversity >50%, avg content >200 chars, <5% short parts.

### Unicode escape sequences in extraction paths/titles

Caused by `json.dumps(ensure_ascii=True)` (Python default). Fix by re-running the extraction script with `ensure_ascii=False`, or run consolidation which auto-fixes Unicode escapes:
```bash
uv run scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
```

### `all-parts-index.json` is empty or missing

The merge step didn't run. Check if individual `parts-index.json` files exist:
```bash
ls -la finetune-project/knowledge/*/parts-index.json
```

If they exist but the merge didn't happen, run it manually:
```bash
python3 -c "
import json, glob
all_parts = []
for f in sorted(glob.glob('finetune-project/knowledge/*/parts-index.json')):
    data = json.load(open(f))
    parts = data.get('parts', data) if isinstance(data, dict) else data
    all_parts.extend(parts)
json.dump({'parts': all_parts}, open('finetune-project/knowledge/all-parts-index.json', 'w'), indent=2)
print(f'Merged {len(all_parts)} parts')
"
```
