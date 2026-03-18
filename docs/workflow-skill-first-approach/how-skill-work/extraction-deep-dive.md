# How Document Extraction Works — Deep Dive

The extraction step (Step 2) is the most complex and time-consuming part of the skill pipeline. This document explains exactly what happens, what data flows where, and how each piece connects to the rest of the pipeline.

## Why Extraction Matters

The skill generates training data **grounded in source documents**. Without extraction, the agent can only generate generic prompts from the objective description. With extraction, every training record can reference specific passages, tables, and figures from the source material — making the training data more accurate and traceable.

## The Extraction Flow

```
                        ┌──────────────┐
    PDF documents       │ Docling Serve │  (Docker container on :5001)
    ────────────────►   │  async API    │
    (parallel submit)   └──────┬───────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              chess-       strategy-   endgame-
              tactics/     guide/      manual/
              docling-     docling-    docling-
              result.json  result.json result.json
                    │          │          │
                    ▼          ▼          ▼
              ┌─────────────────────────────────┐
              │  Agent writes extraction script  │  (custom per document)
              │  per document                    │
              └─────────────────────────────────┘
                    │          │          │
                    ▼          ▼          ▼
              knowledge_  knowledge_  knowledge_
              parts.json  parts.json  parts.json
              parts-      parts-      parts-
              index.json  index.json  index.json
                    │          │          │
                    └──────────┼──────────┘
                               ▼
                    all-parts-index.json  (merged)
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              Step 3:      Step 4:      Upload
              Topic        Data         (incremental,
              Design       Generation    after Step 2)
```

## What Docling Does

Docling Serve is a local document processing service that:
- Runs OCR on scanned pages
- Detects and extracts table structure (rows, columns, headers)
- Extracts embedded images
- Splits text into semantic chunks with heading hierarchy
- Produces a structured JSON response combining chunks + full document tree

### Docling API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check if Docling is running |
| `/v1/chunk/hybrid/file/async` | POST | Submit a document for processing (returns `task_id`) |
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

The extraction script transforms raw Docling output into structured, typed parts. This is **not** a mechanical transformation — the agent writes custom code for each document because:

1. **Heading detection is noisy** — Docling marks many things as `section_header` that aren't real headings (chess moves, page numbers, running headers)
2. **Table handling varies** — some documents have well-structured tables, others have pseudo-tables
3. **Image relevance differs** — diagrams are valuable; decorative headers are not
4. **Domain-specific patterns** — game notation, mathematical formulas, etc. need special handling

### What the Extraction Script Does

```python
# Simplified overview — actual script is document-specific

1. Load docling-result.json
2. Build lookup structures (pointer → element, heading hierarchy)
3. Walk through chunks in document order:
   a. Classify each chunk: is it a real section? noise? continuation?
   b. Merge small consecutive chunks under the same heading
   c. Create text parts with titles from heading hierarchy
4. Process tables from documents[].json_content.tables:
   a. Extract cell structure (rows, columns, headers)
   b. Convert to markdown table format
   c. Create table parts with titles from nearby headings
5. Process images from pictures[] or pages{}:
   a. Extract base64 data
   b. Create image parts with captions from adjacent text
6. Write knowledge_parts.json and parts-index.json
```

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
  --name "chess-tactics.pdf"
```

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
