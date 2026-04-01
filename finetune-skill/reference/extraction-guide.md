# Document Extraction Guide (Docling Serve)

Extract structured knowledge parts from PDFs using Docling Serve — a local Docker container that handles OCR, tables, images, and complex layouts.

**Your deliverable is a `knowledge_parts.json` per document** (stored in `knowledge/{doc-slug}/knowledge_parts.json`, where `{doc-slug}` is the slugified filename) — a typed, linked parts file matching the schema in Section 3. Every text passage, table, and image becomes a `source_part` with a title, extraction path, and provenance metadata. Normalized chunks or raw Docling output are intermediate steps, NOT the final output.

**Multi-document note**: When processing multiple documents, each gets its own subdirectory named by slugifying the filename (e.g., `knowledge/chess-tactics/`, `knowledge/strategy-guide/`). Submit all documents to Docling in parallel (async API), then process each result separately. Prefix part IDs with a document identifier (e.g., `chess-tactics-chapter-3`) to keep them unique across documents. See SKILL.md Step 2 for the full multi-document workflow.

---

## Section 1: Call Docling

### Prerequisites

Check if Docling Serve is already running:

```bash
curl -sS http://127.0.0.1:5001/health
# Expected: {"status":"ok"}
```

If not running, start it:

```bash
docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest
```

This pulls the CPU image (~2 GB on first run) and starts Docling on port 5001. Wait for startup to complete (watch for "Uvicorn running" in the output), then verify with the health check above.

If the container already exists but is stopped:

```bash
docker start docling-serve
```

### Submit a hybrid chunk task

Use the `/v1/chunk/hybrid/file/async` endpoint. This returns BOTH `chunks[]` (text segments with headings and page numbers) AND `documents[]` (the full DoclingDocument with texts, tables, pictures, and body tree) in one response.

**Always use these parameters** to get complete extraction with embedded images:

```bash
TASK_RESPONSE=$(curl -sS -X POST "http://127.0.0.1:5001/v1/chunk/hybrid/file/async" \
  -F "files=@document.pdf;type=application/pdf" \
  -F "include_converted_doc=true" \
  -F "convert_do_ocr=true" \
  -F "convert_do_table_structure=true" \
  -F "convert_include_images=true" \
  -F "convert_image_export_mode=embedded" \
  -F "chunking_merge_peers=true" \
  -F "chunking_max_tokens=1024" \
  -F "chunking_tokenizer=BAAI/bge-small-en-v1.5" \
  -F "chunking_use_markdown_tables=true")

TASK_ID=$(echo "$TASK_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['task_id'])")
echo "Task ID: $TASK_ID"
```

Key parameters:
- `include_converted_doc=true` — includes the full DoclingDocument in the response (needed for tables, pictures, cross-references)
- `convert_include_images=true` + `convert_image_export_mode=embedded` — images are base64-encoded in the response
- `convert_do_table_structure=true` — extracts table cell structure (rows, columns, headers)
- `chunking_merge_peers=true` — merges small adjacent chunks under the same heading
- `chunking_max_tokens=1024` — maximum tokens per chunk. Set higher than the RAG default (512) because fine-tuning needs larger, more coherent knowledge parts — not retrieval-sized fragments
- `chunking_tokenizer=BAAI/bge-small-en-v1.5` — tokenizer for chunk size counting (matches the embedding model used downstream; default `sentence-transformers/all-MiniLM-L6-v2` under-counts tokens for BGE embeddings)

### Poll until complete

```bash
while true; do
  STATUS=$(curl -sS "http://127.0.0.1:5001/v1/status/poll/$TASK_ID")
  TASK_STATUS=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_status',''))")
  echo "Status: $TASK_STATUS"
  if [ "$TASK_STATUS" = "success" ] || [ "$TASK_STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done
```

### Fetch and save the result

```bash
curl -sS "http://127.0.0.1:5001/v1/result/$TASK_ID" > knowledge/docling-result.json
echo "Saved $(wc -c < knowledge/docling-result.json) bytes"
```

---

## Section 1.5: Read the Document

**Before writing the extraction script**, you must read and understand the document. Blindly transforming Docling output without understanding the content produces garbage — chess moves become headings, noise pages become parts, and domain-specific patterns get lost.

### What to do

After saving `knowledge/docling-result.json`:

1. **Read the first 5-10 chunks** — understand the document title, content type (textbook? reference manual? game collection?), heading patterns, and key entities
2. **Sample chunks from the middle and end** — verify the structure stays consistent, note any shifts in content type
3. **Identify real headings vs noise** — Docling marks many things as `section_header` that aren't real headings. Chess moves like "31... Rxd5" are NOT headings. Page numbers, running headers, and chapter markers may appear as headings too.
4. **Note domain-specific patterns** — game notation, mathematical formulas, code blocks, multi-column layouts, glossary entries. These need special handling in the extraction script.
5. **Check the pictures and pages** — are there individual figures in `pictures[]`? Or only full-page renders in `pages{}`? Are the images relevant content (diagrams, charts) or decorative?

### Why this matters

This understanding directly informs the extraction script:
- You can add **domain-specific heading filters** (e.g., skip chess move notation mistakenly labeled as headings)
- You can decide **which heading hierarchy to trust** vs reconstruct
- You can add **noise removal** for content that shouldn't become parts (title pages, copyright, blank pages)
- You can choose the right **image sourcing strategy** (pictures[] vs pages{} fallback)

Skip this step and you'll produce knowledge parts full of noise that hurt downstream training data quality.

---

## Section 2: Understand the Response

The response has two top-level arrays you'll use:

```
result
├── chunks[]                              # Text segments with headings and page numbers
└── documents[0].content.json_content     # Full DoclingDocument (texts, tables, pictures, body tree)
```

### Chunk structure

Each chunk is a text segment from the document, with context about where it came from:

```json
{
  "chunk_index": 20,
  "text": "3.4 Embeddings and Softmax\nSimilarly to other sequence transduction models...\nTable 1: Maximum path lengths...",
  "headings": ["3.4 Embeddings and Softmax"],
  "page_numbers": [5, 6],
  "doc_items": ["#/texts/113", "#/texts/115", "#/tables/0"],
  "num_tokens": 200
}
```

Key fields:
- **`text`** — the chunk's text content (may include table markdown, captions, etc.)
- **`headings`** — heading hierarchy for this chunk (last element is the most specific)
- **`page_numbers`** — which pages this chunk spans
- **`doc_items`** — JSON pointers to items in the DoclingDocument. These are the link between chunks and the structured document.
- **`chunk_index`** — position in the document (use for ordering)

A single chunk can reference multiple doc_items (e.g., a text passage + a table caption + the table itself). A single doc_item can appear in multiple chunks (e.g., a large table split across chunks).

### DoclingDocument structure

The full document lives at `documents[0].content.json_content`. Its structure:

```
DoclingDocument
├── texts[]          # All text items (paragraphs, captions, headers, footnotes, etc.)
├── tables[]         # All tables (with cell-level structure)
├── pictures[]       # All images/figures (with base64 data when include_images=true)
├── groups[]         # Structural containers (list groups, etc.)
├── body             # Tree root — children[] in reading order (references into texts/tables/pictures/groups)
└── pages{}          # Dict keyed by string page numbers ("1", "2", ...) — page-level metadata + full-page renders
```

### TextItem

Every paragraph, heading, caption, footnote, etc. is a TextItem in `texts[]`:

```json
{
  "self_ref": "#/texts/115",
  "parent": {"$ref": "#/tables/0"},
  "children": [],
  "label": "caption",
  "text": "Table 1: Maximum path lengths, per-layer complexity and minimum number of sequential operations for different layer types.",
  "prov": [{"page_no": 6, "bbox": {"l": 107.69, "t": 719.73, "r": 504.00, "b": 689.36, "coord_origin": "BOTTOMLEFT"}, "charspan": [0, 285]}]
}
```

Key fields:
- **`self_ref`** — JSON pointer to this item (e.g., `#/texts/115`)
- **`parent`** — reference to the parent item. A caption's parent points to its table/picture.
- **`label`** — type of text: `text`, `caption`, `section_header`, `title`, `list_item`, `footnote`, `code`, `page_header`, `page_footer`
- **`text`** — the actual text content
- **`prov`** — provenance: page number and bounding box

**Labels to skip**: `page_header`, `page_footer` — these are running headers/footers, not content.

### TableItem

Tables in `tables[]` have structured cell data:

```json
{
  "self_ref": "#/tables/0",
  "label": "table",
  "captions": [{"$ref": "#/texts/115"}],
  "prov": [{"page_no": 6, "bbox": {"l": 124.55, "t": 117.71, "r": 488.24, "b": 221.45}}],
  "data": {
    "num_rows": 5,
    "num_cols": 4,
    "table_cells": [
      {"text": "Layer Type", "column_header": true, "start_row_offset_idx": 0, "start_col_offset_idx": 0, "end_row_offset_idx": 1, "end_col_offset_idx": 1, "row_span": 1, "col_span": 1},
      {"text": "Complexity per Layer", "column_header": true, "start_row_offset_idx": 0, "start_col_offset_idx": 1, "end_row_offset_idx": 1, "end_col_offset_idx": 2},
      {"text": "Self-Attention", "column_header": false, "start_row_offset_idx": 1, "start_col_offset_idx": 0, "end_row_offset_idx": 2, "end_col_offset_idx": 1},
      {"text": "O ( n 2 · d )", "column_header": false, "start_row_offset_idx": 1, "start_col_offset_idx": 1, "end_row_offset_idx": 2, "end_col_offset_idx": 2}
    ]
  }
}
```

Key fields:
- **`captions`** — array of `$ref` pointers to caption TextItems
- **`data.table_cells`** — flat list of cells with row/column offsets and `column_header` flag
- **`data.num_rows`**, **`data.num_cols`** — table dimensions

To reconstruct the table as a 2D array:
1. Cells with `column_header: true` are headers (typically row 0)
2. Use `start_row_offset_idx` and `start_col_offset_idx` to place cells in a grid
3. `row_span` and `col_span` handle merged cells

### PictureItem

Pictures in `pictures[]` contain embedded image data (when `include_images=true`, `image_export_mode=embedded`):

```json
{
  "self_ref": "#/pictures/0",
  "label": "picture",
  "captions": [{"$ref": "#/texts/31"}],
  "prov": [{"page_no": 3, "bbox": {"l": 176.24, "t": 545.71, "r": 436.39, "b": 226.08}}],
  "image": {
    "mimetype": "image/png",
    "dpi": 144,
    "size": {"width": 400, "height": 300},
    "uri": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

Key fields:
- **`captions`** — array of `$ref` pointers to caption TextItems
- **`image.mimetype`** — image format (usually `image/png`)
- **`image.size`** — width and height in pixels
- **`image.uri`** — base64 data URI (only present when `include_images=true` + `image_export_mode=embedded`)

**Important**: If `include_images` was `false` or `image_export_mode` was not `embedded`, the `image` field will be `null`. Always use the parameters from Section 1 to get embedded images.

### Page (full-page renders)

`pages` is a **dict keyed by string page numbers** (not an array). Each entry contains the page dimensions and a full-page PNG render:

```json
{
  "1": {
    "size": {"width": 964.0, "height": 1332.0},
    "image": {
      "mimetype": "image/png",
      "dpi": 144,
      "size": {"width": 964, "height": 1332},
      "uri": "data:image/png;base64,iVBORw0KGgo..."
    },
    "page_no": 1
  },
  "2": {
    "size": {"width": 964.0, "height": 1332.0},
    "image": {
      "mimetype": "image/png",
      "dpi": 144,
      "size": {"width": 964, "height": 1332},
      "uri": "data:image/png;base64,iVBORw0KGgo..."
    },
    "page_no": 2
  }
}
```

Key points:
- **Always present** when `convert_include_images=true` — every page gets a full-page PNG render
- **Different from `pictures[]`**: `pictures[]` contains **individual figures** detected by layout analysis (may be null on CPU). `pages{}` contains **full-page renders** of every page.
- For documents where Docling doesn't extract individual figures (e.g., chess books with board diagrams, technical manuals with inline illustrations), **page images are the only image source**
- Access by string page number: `doc["pages"]["1"]["image"]["uri"]`

### JSON pointer resolution

Doc items and cross-references use JSON pointers like `#/texts/115` or `#/tables/0`. Resolve them against the DoclingDocument:

```python
def resolve(pointer, doc):
    """'#/texts/115' → doc['texts'][115]"""
    parts = pointer.lstrip('#/').split('/')
    collection = parts[0]   # 'texts', 'tables', 'pictures', 'groups'
    index = int(parts[1])
    return doc[collection][index]
```

### Cross-reference patterns

**Table → Caption**: `table.captions = [{"$ref": "#/texts/115"}]` → resolve `#/texts/115` → get the caption TextItem

**Caption → Table**: `text_item.parent = {"$ref": "#/tables/0"}` → the caption's parent is the table it describes

**Picture → Caption**: same pattern as tables — `picture.captions = [{"$ref": "#/texts/31"}]`

**Caption → Picture**: `text_item.parent = {"$ref": "#/pictures/0"}`

**Chunks → Doc items**: `chunk.doc_items = ["#/texts/113", "#/texts/115", "#/tables/0"]` → this chunk contains content from these document items. **Note**: chunks typically only reference `#/texts/N` and `#/tables/N` — pictures (`#/pictures/N`) are NOT included in `doc_items`. Discover pictures through caption `parent.$ref` instead.

---

## Section 3: Target Schema — `knowledge_parts.json`

### What is `knowledge_parts.json` and why does it matter?

`knowledge_parts.json` is the structured representation of a document that the rest of the pipeline depends on. It transforms a raw Docling response (chunks + document tree) into a flat list of **typed, linked source_parts** — each text passage, table, and image becomes a discrete part with a title, extraction path, and provenance metadata.

**Why not just use chunks?** Chunks are text-only segments — they don't carry table cell structure, image data, or caption links. They also have unreliable headings (Docling promotes noise like chess moves to section_header). `knowledge_parts.json` fixes all of this:

- **Typed parts** — text, table, and image parts each carry type-specific data in `content_metadata` (table headers/rows, image dimensions)
- **Clean titles** — domain-specific heading filters produce a reliable `extraction_path` hierarchy
- **Cross-references** — captions link to their tables/pictures via `content_metadata`, co-occurring parts link via `extraction_metadata.related`
- **Unified content** — every part's primary data lives in `content` (text, markdown table, or base64 data URI)

**Who consumes it?** Topic generation reads `extraction_path` to build the topic hierarchy. Training data generation reads part content and titles to create prompts. The UI displays parts grouped by `extraction_path`. If this file is missing or malformed, all downstream steps fail.

This is the output you produce. Every document extraction must result in a `knowledge_parts.json` file matching this schema.

```json
{
  "source": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "reference_id": "doc-001",
    "workflow_id": "wf_abc123",
    "name": "1706.03762v7.pdf",
    "description": "Attention Is All You Need — foundational transformer paper",
    "metadata": {
      "total_pages": 15,
      "extraction_method": "docling_hybrid",
      "total_chunks": 61,
      "extracted_at": "2026-03-10T15:30:00Z"
    }
  },
  "parts": [
    {
      "id": "p-001",
      "source_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "text",
      "content": "The dominant sequence transduction models are based on...",
      "title": "Abstract",
      "extraction_path": "[\"Abstract\"]",
      "extraction_metadata": {
        "pages": [1],
        "source_chunks": [2],
        "doc_item": "#/texts/13",
        "related": ["p-002", "p-003"]
      }
    },
    {
      "id": "p-010",
      "source_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "table",
      "content": "| Layer Type | Complexity per Layer | Sequential Ops | Max Path |\n|---|---|---|---|\n| Self-Attention | O(n²·d) | O(1) | O(1) |\n...",
      "title": "3.4 Embeddings and Softmax",
      "extraction_path": "[\"3 Model Architecture\", \"3.4 Embeddings and Softmax\"]",
      "content_metadata": {
        "num_rows": 5,
        "num_cols": 4,
        "headers": ["Layer Type", "Complexity per Layer", "Sequential Operations", "Maximum Path Length"],
        "rows": [
          ["Self-Attention", "O(n²·d)", "O(1)", "O(1)"],
          ["Recurrent", "O(n·d²)", "O(n)", "O(n)"]
        ],
        "caption": "Table 1: Maximum path lengths, per-layer complexity and minimum number of...",
        "caption_part_id": "p-011"
      },
      "extraction_metadata": {
        "pages": [6],
        "source_chunks": [20, 21],
        "doc_item": "#/tables/0",
        "related": ["p-009"]
      }
    },
    {
      "id": "p-011",
      "source_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "text",
      "content": "Table 1: Maximum path lengths, per-layer complexity and minimum number of...",
      "title": "3.4 Embeddings and Softmax",
      "extraction_path": "[\"3 Model Architecture\", \"3.4 Embeddings and Softmax\"]",
      "content_metadata": {
        "caption_for_part_id": "p-010"
      },
      "extraction_metadata": {
        "pages": [6],
        "source_chunks": [20],
        "doc_item": "#/texts/115"
      }
    },
    {
      "id": "p-020",
      "source_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "image",
      "content": "data:image/png;base64,iVBORw0KGgo...",
      "title": "3.2 Attention",
      "extraction_path": "[\"3 Model Architecture\", \"3.2 Attention\"]",
      "content_metadata": {
        "mimetype": "image/png",
        "width": 400,
        "height": 300,
        "caption": "Figure 2: Scaled Dot-Product Attention and Multi-Head Attention",
        "caption_part_id": "p-021"
      },
      "extraction_metadata": {
        "pages": [3],
        "source_chunks": [8],
        "doc_item": "#/pictures/0",
        "related": ["p-007", "p-008"]
      }
    }
  ]
}
```

### Schema rules

1. **Top-level**: `source` (document metadata) and `parts[]` (flat list of source_parts). Note: API response uses `part` (singular) as the field name on `KnowledgeSource`.
2. **Every part has** (required): `id`, `source_id`, `type` (text|table|image), `content`
3. **Every part may have** (optional): `reference_id`, `title`, `extraction_path`, `content_metadata`, `extraction_metadata`
4. **`content` is always a string** — for text parts it's the text content, for tables it's the markdown rendering, for images it's the base64 data URI. This keeps a single unified field for the primary data.
5. **`content_metadata`** carries type-specific structure (stored as JSON string in DB, parsed as object in API):
   - **table**: `num_rows`, `num_cols`, `headers` (string array), `rows` (2D string array), `caption`, `caption_part_id`
   - **image**: `mimetype`, `width`, `height`, `caption`, `caption_part_id`
   - **caption text**: `caption_for_part_id` (points back to the table/image this text captions)
6. **`extraction_metadata`** carries provenance from the extraction process (stored as JSON string in DB, parsed as object in API): `pages` (page numbers), `source_chunks` (Docling chunk indices), `doc_item` (JSON pointer like `#/texts/13`), `related` (part IDs of co-occurring items from the same Docling chunk)
7. **`extraction_path`** is a **string** (TEXT column in DB) containing a JSON-encoded array of the heading hierarchy from root to leaf — e.g., `'["3 Model Architecture", "3.2 Attention"]'`. `title` is the leaf (last element of the decoded array).
8. **Flat list** — no sections grouping. Parts are ordered by document position. Consumers parse `extraction_path` and group if needed.
9. **`source`** maps to the `knowledge_sources` table. Supports optional `reference_id` for external system mapping (unique per workflow). The `metadata` field holds extraction-level details (total_pages, extraction_method, total_chunks, extracted_at).

The formal JSON Schema is at `reference/knowledge-parts-schema.json` — use it to validate your output.

**This schema is mandatory.** Do not invent alternative formats (e.g., normalized chunk lists, cleaned chunk JSON). Downstream consumers — topic generation, training data creation, and the UI — all expect `knowledge_parts.json` with typed source_parts. If you skip this step, the entire pipeline breaks.

---

## Section 4: How to Create Parts

**You must produce a `knowledge_parts.json` per document** (in `knowledge/{doc-slug}/knowledge_parts.json`, where `{doc-slug}` is the slugified filename) matching the Section 3 schema. This is not optional. Normalized chunks, cleaned chunk lists, or any other intermediate format are NOT the deliverable — they are steps along the way. The final output must have a `source` object and a flat `parts[]` array where every part has `id`, `source_id`, `type` (text|table|image), `content`, `title`, and `extraction_path`. Image parts must have the base64 data URI as `content` (use page fallback if needed). Caption links must be bidirectional via `content_metadata`.

**Important**: Prefix all part IDs with the document identifier — typically the slugified filename (e.g., `chess-tactics-chapter-3`) to keep them unique when parts from multiple documents are merged into `all-parts-index.json`.

> ⚠️ **Common mistake: flattening tables to text.** If a chunk references `#/tables/N` in its `doc_items`, you MUST create a table-typed part, not a text part. The structured cell data in `json_content.tables[N].data` is critical for programmatic graders that need to look up values (e.g., "chicken breast = 31g protein"). After writing your extraction script, run `python3 ${CLAUDE_SKILL_DIR}/scripts/extract_tables.py` to ensure all table parts have proper `type: "table"` and `content_metadata` with headers and rows.

Write your own extraction script tailored to the document. There is no template — each document is different and may require domain-specific filtering or restructuring. Here's the general approach:

### Step 1: Load the response

```python
import json

with open("knowledge/docling-result.json") as f:
    result = json.load(f)

chunks = result["chunks"]
doc = result["documents"][0]["content"]["json_content"]
```

### Step 2: Build lookup structures

```python
def resolve(pointer, doc):
    """Resolve '#/texts/115' → doc['texts'][115]"""
    parts = pointer.lstrip('#/').split('/')
    return doc[parts[0]][int(parts[1])]

def pointer_type(pointer):
    """'#/tables/0' → 'tables', '#/texts/115' → 'texts', '#/pictures/0' → 'pictures'"""
    return pointer.lstrip('#/').split('/')[0]
```

### Step 3: Walk chunks in document order

Process chunks by `chunk_index` to maintain reading order. For each chunk:

1. **Track heading context** from `chunk.headings` — these give you `title` (leaf heading) and `extraction_path` (JSON-encode the headings array as a string)
2. **Iterate `doc_items`** — each pointer references a text or table in the document
3. **Determine part type** by the pointer prefix:
   - `#/tables/N` → type `table`
   - `#/texts/N` → check the item's `label` field
4. **Dedup by doc_item pointer** — the same item may appear in multiple chunks. Track which pointers you've already processed.
5. **Record `source_chunks`** — list all chunk indices where this doc_item appeared

**Important — pictures are NOT in `doc_items`**: Chunk `doc_items` typically only contain `#/texts/N` and `#/tables/N` pointers. Pictures (`#/pictures/N`) are **not referenced by chunks**. Instead, discover pictures through caption text items: when you encounter a text item with `label: "caption"`, check its `parent.$ref` — if it points to `#/pictures/N`, that's how you find the picture. Build a `caption_pointer → picture_pointer` map in Step 2 and create the image part when you process the caption.

**Heading context reliability**: Chunk `headings` reflect whatever Docling labeled as `section_header`, which may include noise (chess moves, page numbers, etc.). For domain-specific documents, consider building a heading context map from the document's `texts[]` array instead — scan all `section_header` items, filter to real headings, and look up the correct heading by page number. This is more robust than relying on chunk headings alone.

### Step 4: Create parts by type

**For text items** (`#/texts/N`):
- Use `item.text` as the part's `content`
- Skip items with `label` = `page_header` or `page_footer` (noise)
- Items with `label` = `caption` should still become parts — they'll be linked via `content_metadata.caption_for_part_id`
- Items with `label` = `section_header` can be skipped OR included depending on whether the heading adds value beyond what `extraction_path` provides

**For table items** (`#/tables/N`):
- Extract `data.table_cells` into `headers` and `rows` in `content_metadata`:
  - Cells with `column_header: true` → headers array (use `start_col_offset_idx` for ordering)
  - Remaining cells → rows (use `start_row_offset_idx` and `start_col_offset_idx`)
  - Handle `row_span`/`col_span` for merged cells
- Render a markdown table for the `content` field
- Resolve `captions` pointers to find the caption text → store in `content_metadata.caption` and `content_metadata.caption_part_id`

**For picture items** (`#/pictures/N`) — discovered via caption `parent.$ref`, not from chunk `doc_items`:
- When processing a caption text item whose `parent.$ref` points to `#/pictures/N`, create both the caption text part AND the image part
- **Primary**: use `item.image` if present — this is the individual figure cropped by layout analysis (typically ~300-500px). Extract `mimetype`, `size.width`, `size.height` into `content_metadata`. Use `uri` as the part's `content`.
- **Fallback**: if `item.image` is `null` (common on CPU — all pictures may be null), use the page-level render from `doc["pages"][str(page_no)]["image"]` instead. **Warning**: page images are full-page renders (~964x1332px), not cropped figures.
- Page images from `pages{}` are **always available** when `convert_include_images=true`
- Set `content` to the base64 data URI (e.g., `"data:image/png;base64,..."`)
- Link the image part to its caption part immediately (bidirectional `content_metadata.caption_part_id` / `content_metadata.caption_for_part_id`)

### Step 4.5: Consolidate Parts (Quality Gate)

**This step is mandatory.** Creating one part per Docling text item produces hundreds of tiny fragments — a 100-page PDF should NOT yield 1000+ parts. Consolidate before proceeding.

> **Shortcut**: Instead of implementing the logic below manually, use the provided script:
> ```bash
> python3 ${CLAUDE_SKILL_DIR}/scripts/consolidate_parts.py knowledge/{doc-slug}/knowledge_parts.json
> ```
> This handles merging, min-length filtering, Unicode fixes, ID reassignment, and quality validation in one step. The logic below explains what the script does.

#### Merge adjacent text parts under the same heading

Adjacent text parts (same `extraction_path`) should be merged into a single part:

```python
def consolidate_parts(parts):
    """Merge adjacent text parts sharing the same extraction_path."""
    if not parts:
        return parts

    merged = []
    buffer = None

    for part in parts:
        # Never merge tables or images — only text parts
        if part["type"] != "text":
            if buffer:
                merged.append(buffer)
                buffer = None
            merged.append(part)
            continue

        # Start new buffer or merge into existing
        if buffer is None:
            buffer = dict(part)  # shallow copy
            buffer["content"] = part["content"]
            buffer["_source_chunks"] = list(part.get("extraction_metadata", {}).get("source_chunks", []))
        elif part.get("extraction_path") == buffer.get("extraction_path"):
            # Same heading context — merge content
            buffer["content"] += "\n\n" + part["content"]
            buffer["_source_chunks"].extend(
                part.get("extraction_metadata", {}).get("source_chunks", [])
            )
            # Extend page list
            buf_pages = buffer.get("extraction_metadata", {}).get("pages", [])
            new_pages = part.get("extraction_metadata", {}).get("pages", [])
            buffer.setdefault("extraction_metadata", {})["pages"] = sorted(
                set(buf_pages + new_pages)
            )
        else:
            # Different heading — flush buffer, start new
            merged.append(buffer)
            buffer = dict(part)
            buffer["content"] = part["content"]
            buffer["_source_chunks"] = list(part.get("extraction_metadata", {}).get("source_chunks", []))

    if buffer:
        merged.append(buffer)

    # Clean up temp field
    for p in merged:
        if "_source_chunks" in p:
            p.setdefault("extraction_metadata", {})["source_chunks"] = sorted(set(p.pop("_source_chunks")))

    return merged
```

#### Drop parts that are too small

After merging, remove text parts with fewer than 50 characters — these are typically isolated headings, page numbers, or noise fragments:

```python
MIN_CONTENT_LENGTH = 50

consolidated = [
    p for p in consolidated
    if p["type"] != "text" or len(p.get("content", "")) >= MIN_CONTENT_LENGTH
]
```

#### Validate title diversity

If more than 50% of parts share the same title, the heading detection failed. Fix it before proceeding:

```python
from collections import Counter

title_counts = Counter(p.get("title", "") for p in consolidated)
most_common_title, most_common_count = title_counts.most_common(1)[0]
title_diversity = 1 - (most_common_count / len(consolidated))

if title_diversity < 0.5:
    print(f"WARNING: {most_common_count}/{len(consolidated)} parts share title "
          f"'{most_common_title}' — heading detection is broken!")
    print("FIX: Rebuild heading context from doc['texts'] section_headers instead of chunk headings.")
    # Common fix: scan texts[] for label='section_header', build page→heading map,
    # assign heading by matching part page numbers to the nearest preceding heading.
```

**When title diversity is low**, the extraction script relied on chunk `headings` which were unreliable for this document. Rebuild heading context from the document structure:

1. Scan `doc['texts']` for all items with `label: "section_header"`
2. Filter out noise headings (chess moves, page numbers, repeated document titles)
3. Build a `page_number → heading` map sorted by page
4. For each part, look up its page number in the map to find the correct heading
5. Re-derive `title` and `extraction_path` from this corrected heading context

#### Validate parts-per-page ratio

A healthy extraction produces roughly **2-10 parts per page**. Flag outliers:

```python
total_pages = source_metadata.get("total_pages", 1)
parts_per_page = len(consolidated) / max(total_pages, 1)

if parts_per_page > 15:
    print(f"WARNING: {len(consolidated)} parts / {total_pages} pages = "
          f"{parts_per_page:.1f} parts/page — too granular!")
    print("Check: are adjacent text items being merged? Is heading detection splitting too aggressively?")
elif parts_per_page < 1:
    print(f"WARNING: {len(consolidated)} parts / {total_pages} pages = "
          f"{parts_per_page:.1f} parts/page — extraction may be incomplete.")
```

**Target ranges by document type:**
| Document type | Expected parts/page | Notes |
|--------------|-------------------|-------|
| Dense textbook | 2-5 | Long paragraphs, few images |
| Technical manual | 3-8 | Mixed text, tables, diagrams |
| Reference/collection | 5-12 | Many short entries (e.g., game annotations) |
| Image-heavy (chess diagrams) | 3-6 | Text parts + image parts per page |

If your extraction is far outside these ranges, something is wrong. Fix the extraction script before uploading — bad parts poison all downstream steps.

### Step 5: Build cross-references

After creating all parts, link them:

**Caption links**: For each table/picture part that has captions:
1. Find the caption text part (by matching `extraction_metadata.doc_item` to the resolved caption pointer)
2. Set `table_or_picture_part.content_metadata.caption_part_id = caption_part.id`
3. Set `caption_part.content_metadata.caption_for_part_id = table_or_picture_part.id`

**Related links**: Parts whose doc_items appeared in the same chunk are related:
1. Group parts by the chunks they appeared in
2. For each group, add all other part IDs to each part's `extraction_metadata.related`

### Step 6: Assign IDs and output

- Assign sequential IDs: `p-001`, `p-002`, etc.
- Set `source_id` on every part to the `source.id` value
- JSON-encode each part's `extraction_path` as a string (e.g., `json.dumps(["Ch 1", "1.2 Intro"])`)
- Sort parts by first appearance (first `extraction_metadata.source_chunks` value)
- Wrap in the `knowledge_parts.json` envelope with the `source` object (id, workflow_id, name, description, metadata)
- Write to `knowledge/{doc-slug}/knowledge_parts.json` (per-document subdirectory)

Also produce `knowledge/{doc-slug}/parts-index.json` — a lightweight index for topic classification:
```python
index = []
for part in parts:
    index.append({
        "id": part["id"],
        "type": part["type"],
        "title": part.get("title", ""),
        "extraction_path": part.get("extraction_path", ""),
        "pages": part.get("extraction_metadata", {}).get("pages", []),
        "content_preview": part["content"][:200],
        "source_doc": source_filename,  # e.g., "chess-tactics.pdf"
        "relevant": None  # Set in Step 3 (topic design) — True if relevant to objective, False if not, None if not yet classified
    })
with open(f"knowledge/doc-{N}/parts-index.json", "w") as f:
    json.dump(index, f, indent=2)
```

### Step 7: Validate Output

Before finalizing `knowledge_parts.json`, run **all** of these checks. If any fail, fix the extraction script and re-run — bad parts poison all downstream steps (topics, records, training).

#### 7a. Quantitative health checks (run as code)

```python
import json
from collections import Counter

with open(f"knowledge/{doc_slug}/knowledge_parts.json") as f:
    kp = json.load(f)

parts = kp["parts"]
total_pages = kp["source"]["metadata"].get("total_pages", 1)
text_parts = [p for p in parts if p["type"] == "text"]
table_parts = [p for p in parts if p["type"] == "table"]
image_parts = [p for p in parts if p["type"] == "image"]

# --- Check 1: Parts-per-page ratio ---
ppp = len(parts) / max(total_pages, 1)
status = "OK" if 1 <= ppp <= 15 else "FAIL"
print(f"[{status}] Parts/page: {ppp:.1f} ({len(parts)} parts / {total_pages} pages)")
if ppp > 15:
    print("  → Too granular. Merge adjacent text parts under same heading.")
if ppp < 1:
    print("  → Too few parts. Check if extraction is incomplete.")

# --- Check 2: Minimum content length ---
short_parts = [p for p in text_parts if len(p.get("content", "")) < 50]
status = "OK" if len(short_parts) == 0 else "WARN" if len(short_parts) < 5 else "FAIL"
print(f"[{status}] Short parts (<50 chars): {len(short_parts)}/{len(text_parts)}")
if short_parts:
    for sp in short_parts[:3]:
        print(f"  → '{sp.get('title', '?')}': {len(sp.get('content', ''))} chars")

# --- Check 3: Title diversity ---
titles = [p.get("title", "") for p in parts]
title_counts = Counter(titles)
top_title, top_count = title_counts.most_common(1)[0]
diversity = 1 - (top_count / len(parts))
status = "OK" if diversity >= 0.5 else "FAIL"
print(f"[{status}] Title diversity: {diversity:.0%} (most common: '{top_title}' × {top_count})")
if diversity < 0.5:
    print("  → Heading detection is broken. Rebuild from doc structure, not chunk headings.")

# --- Check 4: Average content length ---
avg_len = sum(len(p.get("content", "")) for p in text_parts) / max(len(text_parts), 1)
status = "OK" if avg_len >= 200 else "WARN" if avg_len >= 100 else "FAIL"
print(f"[{status}] Avg text part length: {avg_len:.0f} chars")
if avg_len < 200:
    print("  → Parts are too short for meaningful training data. Merge more aggressively.")

# --- Check 5: Content type distribution ---
print(f"[INFO] Distribution: {len(text_parts)} text, {len(table_parts)} table, {len(image_parts)} image")

# --- Check 6: Unique extraction paths ---
paths = set(p.get("extraction_path", "") for p in parts)
print(f"[INFO] Unique extraction paths: {len(paths)}")
if len(paths) <= 2:
    print("  → Very few unique paths — heading hierarchy may be flat or broken.")

# --- Summary ---
checks_passed = all([
    1 <= ppp <= 15,
    len(short_parts) < 5,
    diversity >= 0.5,
    avg_len >= 100,
])
print(f"\n{'PASS' if checks_passed else 'FAIL'}: {'Ready to upload' if checks_passed else 'Fix extraction before uploading'}")
```

**All FAIL checks must be resolved before uploading.** WARN checks should be investigated but may be acceptable depending on the document type.

#### 7b. Qualitative spot-checks (manual)

1. **Sample 10 parts and verify titles make sense** — titles should be real section titles, not chess moves, page numbers, or noise. If titles look wrong, fix the extraction logic (add domain-specific filters, rebuild heading hierarchy from the document structure).
2. **Check image parts have non-empty `content`** — every type=image part must have a base64 data URI in `content`. If any are empty, use the page-level fallback from `pages{}`.
3. **Verify caption links are bidirectional** — if part A has `content_metadata.caption_part_id = "p-011"`, then p-011 must have `content_metadata.caption_for_part_id = A's id`. Missing links break downstream consumers.
4. **Count parts by type** — does the distribution make sense for this document? A 200-page textbook with 0 image parts is suspicious. A chess book with 50 text parts and 0 images missed all the board diagrams.
5. **Spot-check text content** — read a few text parts. Are they meaningful content or garbled OCR noise?

If validation reveals problems, fix the extraction script and re-run — don't ship bad parts downstream.

### Encoding: always use `ensure_ascii=False`

When writing `knowledge_parts.json`, always preserve Unicode characters:

```python
with open(f"knowledge/{doc_slug}/knowledge_parts.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)
```

Without `ensure_ascii=False`, non-ASCII characters (Cyrillic, CJK, accented Latin) get stored as `\u0xxx` escape sequences. These render as garbage in the UI and produce nonsensical extraction paths like `["\u041f\u043e\u0436\u0430..."]` instead of readable section names.

**Also check**: when reading the Docling response, always use `json.load()` (not manual string parsing) to properly decode Unicode. Never use `repr()` or `ascii()` on text strings.

### Noise filtering

Some doc items are noise and should be skipped:

```python
NOISE_HEADING_PATTERNS = [
    r"^table of contents$",
    r"^contents$",
    r"^copyright$",
    r"^acknowledg",
    r"^preface$",
    r"^foreword$",
    r"^bibliography$",
    r"^references?$",
    r"^index$",
]
```

Skip text items whose `label` is `page_header` or `page_footer`. Optionally skip items under noise headings depending on the document and objective.

---

## Section 5: Upload to Gateway

After producing `knowledge_parts.json` for each document (in `knowledge/{doc-slug}/`), upload each source document and its parts to the gateway. **Repeat these two steps for each document.**

### Step 1: Create Knowledge Source (multipart)

Upload the original file along with metadata. The API requires `multipart/form-data` — not JSON.

```bash
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "description=Source document for training data" \
  -F 'metadata={"total_pages":84,"extraction_method":"docling_hybrid","total_chunks":61}')
KS_ID=$(echo "$KS" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledge_source']['id'])")
echo "Created knowledge source: $KS_ID"
```

**Form fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | The source document file |
| `name` | Yes | Display name |
| `reference_id` | No | External reference ID (unique per workflow) |
| `description` | No | Document description |
| `metadata` | No | JSON string with extraction metadata |

### Step 2: Add Extracted Parts (JSON)

Upload the parts from `knowledge_parts.json`. The body is a JSON array of parts — the API sets `source_id` automatically.

```bash
PARTS=$(python3 -c "
import json
# Replace DOC_DIR with the per-document directory (e.g., 'knowledge/doc-1')
d = json.load(open(f'{DOC_DIR}/knowledge_parts.json'))
for p in d['parts']:
    p['reference_id'] = p.pop('id', None)
    p.pop('source_id', None)
print(json.dumps(d['parts']))
")
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" -d "$PARTS"
```

Each part in the array matches the `knowledge_parts.json` schema from Section 3:
- `type` (required): `text`, `table`, or `image`
- `content` (required): the part content
- `reference_id` (optional): used for topic-source linking later
- `title`, `extraction_path`, `content_metadata`, `extraction_metadata`: optional metadata

**Note:** The `source_id` field from `knowledge_parts.json` is not sent — the API sets it based on the URL path. The `id` field is moved to `reference_id` before upload — the server generates a UUID for `id`, and the original `p-NNN` value is preserved in `reference_id` for topic-source linking via `relations.json`.

### How `knowledge_parts.json` maps to API calls

| `knowledge_parts.json` field | API call | Maps to |
|------------------------------|----------|---------|
| `source.name` | `POST /knowledge` | `-F "name=..."` |
| `source.description` | `POST /knowledge` | `-F "description=..."` |
| `source.reference_id` | `POST /knowledge` | `-F "reference_id=..."` |
| `source.metadata` | `POST /knowledge` | `-F "metadata={...}"` |
| `parts[]` | `POST /knowledge/{ks_id}/parts` | JSON body array |
| `parts[].reference_id` | `POST /knowledge/{ks_id}/parts` | Used for topic-source linking |

---

## Section 6: Fallback (pdftotext)

When Docker is not available, use `pdftotext` for basic text extraction:

```bash
pdftotext input.pdf output.txt
```

If `pdftotext` is not found, try `/opt/homebrew/bin/pdftotext` (macOS) or install: `brew install poppler` / `apt-get install poppler-utils`.

Then use `docling_extract.py` to extract structured parts (preferred), or manually parse the text output into `knowledge_parts.json` format. Note: pdftotext loses tables, images, and complex layout — use Docling Serve when possible.

---

## Section 7: Options Reference

### Hybrid chunk endpoint: `/v1/chunk/hybrid/file/async`

| Option | Default | Description |
|--------|---------|-------------|
| `include_converted_doc` | `false` | Include full DoclingDocument in response (required for knowledge parts) |
| `chunking_merge_peers` | `true` | Merge small adjacent chunks under the same heading |
| `chunking_max_tokens` | `0` (unlimited) | Maximum tokens per chunk. Use default (unlimited) — recommended for knowledge extraction |
| `chunking_tokenizer` | `sentence-transformers/all-MiniLM-L6-v2` | Tokenizer for chunk size counting. Recommend `BAAI/bge-small-en-v1.5` to match BGE embedding models |
| `chunking_use_markdown_tables` | `true` | Render tables as markdown in chunk text |
| `chunking_include_raw_text` | `false` | Include raw text alongside markdown text |
| `convert_do_ocr` | `true` | Enable OCR for scanned pages |
| `convert_force_ocr` | `false` | Force OCR even on text-based PDFs |
| `convert_ocr_engine` | `easyocr` | OCR engine (`easyocr`, `tesseract`) |
| `convert_do_table_structure` | `true` | Detect and extract table cell structure |
| `convert_include_images` | `false` | Include base64 images in output |
| `convert_image_export_mode` | `placeholder` | How to handle images: `placeholder`, `embedded`, `referenced` |
| `convert_pdf_backend` | `docling_parse` | PDF parsing backend |
| `convert_page_range` | (all) | JSON array of page range `[start, end]` |
| `convert_md_page_break_placeholder` | `<!-- page-break -->` | Marker between pages |

### Convert endpoint: `/v1/convert/file/async`

| Option | Default | Description |
|--------|---------|-------------|
| `to_formats` | `md` | Output format(s): `md`, `json`, `html`, `text`, `doctags` |
| `do_ocr` | `true` | Enable OCR |
| `force_ocr` | `false` | Force OCR |
| `ocr_engine` | `easyocr` | OCR engine |
| `do_table_structure` | `true` | Detect tables |
| `table_mode` | `accurate` | Table detection mode (`accurate` or `fast`) |
| `table_cell_matching` | `true` | Match cells to table structure |
| `include_images` | `false` | Include base64 images |
| `image_export_mode` | `placeholder` | Image handling mode |
| `pdf_backend` | `dlparse_v4` | PDF parsing backend |
| `page_range` | (all) | JSON array of page ranges |
| `md_page_break_placeholder` | `<!-- page-break -->` | Page break marker |

---

## Troubleshooting

### Container not running

```bash
# Check if container exists
docker ps -a | grep docling-serve

# Start if stopped
docker start docling-serve

# Or recreate from scratch
docker rm -f docling-serve 2>/dev/null
docker run -d --name docling-serve -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest
```

### Large PDFs (100+ pages)

For very large PDFs, batch by page range to avoid timeouts:

```bash
curl -sS -X POST "http://127.0.0.1:5001/v1/chunk/hybrid/file/async" \
  -F "files=@large-doc.pdf;type=application/pdf" \
  -F "include_converted_doc=true" \
  -F "convert_include_images=true" \
  -F "convert_image_export_mode=embedded" \
  -F "convert_do_table_structure=true" \
  -F "convert_page_range=[0, 49]" \
  ...
```

Process each batch separately and merge the resulting knowledge parts.

### Images missing from pictures

If `pictures[].image` is `null`, the extraction was run without image embedding. Re-run with:
- `convert_include_images=true`
- `convert_image_export_mode=embedded`

### Table structure missing

If `tables[].data` has no `table_cells`, ensure `convert_do_table_structure=true`.

### OCR quality issues

- Try `convert_force_ocr=true` if text extraction is garbled
- Switch OCR engine: `convert_ocr_engine=tesseract`
- Check if the PDF is image-based: `pdftotext input.pdf - | head` — empty output = image-based, needs OCR

### Task fails or hangs

- Check container logs: `docker logs docling-serve --tail 50`
- Verify memory: Docling needs ~2-4 GB RAM for large PDFs
- Restart the container: `docker restart docling-serve`
