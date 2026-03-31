# How Document Extraction Works — Deep Dive

The extraction step (Step 2) is the most complex and time-consuming part of the skill pipeline. This document explains exactly what happens, what data flows where, and how each piece connects to the rest of the pipeline.

## Why Extraction Matters

The skill generates training data **grounded in source documents**. Without extraction, the agent can only generate generic prompts from the objective description. With extraction, every training record can reference specific passages, tables, and figures from the source material — making the training data more accurate and traceable.

## The Extraction Flow

```
                     Docker available?
                     ┌─── YES ──────────────────┐
                     │                           │
    PDF documents    │   ┌──────────────┐        │
    ─────────────────┤   │ Docling Serve │        │
                     │   │  async API    │        │
                     │   └──────┬───────┘        │
                     │          │                 │
                     │   docling_extract.py       │
                     │   (per document,            │
                     │    process individually)    │
                     │          │                 │
                     │   docling-result.json       │
                     │   (per document)            │
                     │          │                 │
                     │          ▼                 │
                     │   Agent writes extraction  │
                     │   script per document      │
                     │          │                 │
                     │   consolidate_parts.py     │
                     │   content quality check    │
                     │          │                 │
                     └──── NO ──┤                 │
                     │          │                 │
                     │   pdftotext_extract.py     │
                     │   (per document, or        │
                     │    --batch if similar size) │
                     │   (text only, no tables/   │
                     │    images)                 │
                     │          │                 │
                     └──────────┤                 │
                                ▼                 │
                    knowledge_parts.json          │
                    + parts-index.json            │
                    (per document)                │
                                │                 │
                    validate_extraction.py         │
                                │
                    all-parts-index.json  (merged)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Step 3:       Step 4:      Upload
              Topic         Data         (incremental,
              Design        Generation    after Step 2)
```

> **Note on batch mode**: The default flow processes each PDF end-to-end individually (extract, process, upload) before moving to the next. This avoids blocking — a small PDF can be fully processed while Docling works on a larger one. Use `--batch` only if all documents are similar size.

## What Docling Does

Docling Serve is a local document processing service that:
- **Auto-detects** digital vs scanned PDFs — skips OCR for digital PDFs (30-50% faster)
- Runs OCR on scanned pages (when needed)
- Detects and extracts table structure (rows, columns, headers)
- Extracts embedded images
- Splits text into semantic chunks with heading hierarchy
- Produces a structured JSON response combining chunks + full document tree

### OCR Auto-Detection

`docling_extract.py` automatically detects whether a PDF is digital (has selectable text) or scanned (needs OCR). It uses `pdftotext` to sample a few content pages — if 50+ words are found, the PDF is digital and OCR is skipped. This gives a 30-50% speed improvement for digital PDFs without requiring the user to know their PDF type.

### Chunking Strategy

The `chunking_max_tokens` parameter (default: 8192) is a **safety ceiling**, not a target size. Docling's HybridChunker splits on document structure boundaries (headings, paragraphs) first. The max_tokens only prevents runaway chunks for very long sections. The real chunking happens in the custom extraction script (`extract.py`), which groups content by semantic units based on the document's actual structure.

### Docling API Endpoints (internal to `docling_extract.py`)

The agent uses `scripts/docling_extract.py` — it must NOT call these endpoints directly via curl. The script handles the full async lifecycle (submit → poll → fetch → auto-detect OCR). Internally it calls:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check if Docling is running (agent checks this before calling the script) |
| `/v1/chunk/hybrid/file/async` | POST | Submit a document for processing (returns `task_id`). Uses `chunking_max_tokens=8192` as safety ceiling |
| `/v1/status/poll/{task_id}` | GET | Check if processing is complete |
| `/v1/result/{task_id}` | GET | Fetch the processed result |

### Docling Response Structure

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

## From Docling Result to Knowledge Parts

The extraction uses `build_knowledge_parts.py` — a **deterministic script** that transforms raw Docling output into structured, typed parts. The same input always produces the same output, eliminating the non-determinism that caused flaky extraction across runs.

> **History**: Previously, subagents wrote custom extract.py scripts per document, causing different output on every run. As of 2026-03-31, the default is `build_knowledge_parts.py` for all documents. Custom scripts are only written when the user provides explicit CUSTOM_INSTRUCTIONS or the deterministic script produces 0 parts.

### What `build_knowledge_parts.py` Does

```python
# Deterministic pipeline — same input always produces same output

1. Load docling-result.json (chunks[])
2. Filter noise: TOC, copyright, blank pages, chunks <20 chars
3. Classify each chunk by type:
   - text: default (prose, explanations)
   - table: >3 pipe lines or "table"/"schedule" in heading
   - image: has captions
4. Split oversized chunks (>3000 chars) at paragraph/sentence boundaries
5. Merge undersized chunks (<100 chars) with neighbors
6. Assign IDs: {doc-slug}-{heading-slug}[-partN]
7. Write knowledge_parts.json + parts-index.json
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
  --metadata '{"extraction_method":"docling_hybrid"}'
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

### Docling not available (Docker not installed)

Use the `pdftotext_extract.py` fallback — same CLI pattern as `docling_extract.py` but zero dependencies:

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
