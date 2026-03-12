# Document Extraction Guide (Docling Serve)

Extract structured knowledge parts from PDFs using Docling Serve — a local Docker container that handles OCR, tables, images, and complex layouts.

**Your deliverable is `knowledge/knowledge_parts.json`** — a typed, linked parts file matching the schema in Section 3. Every text passage, table, and image becomes a part with headings, cross-references, and provenance. Normalized chunks or raw Docling output are intermediate steps, NOT the final output.

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

`knowledge_parts.json` is the structured representation of a document that the rest of the pipeline depends on. It transforms a raw Docling response (chunks + document tree) into a flat list of **typed, linked parts** — each text passage, table, and image becomes a discrete part with a heading, page location, and cross-references to related parts.

**Why not just use chunks?** Chunks are text-only segments — they don't carry table cell structure, image data, or caption links. They also have unreliable headings (Docling promotes noise like chess moves to section_header). `knowledge_parts.json` fixes all of this:

- **Typed parts** — text, table, and image parts each carry type-specific data (table headers/rows, image data_uri)
- **Clean headings** — domain-specific heading filters produce a reliable `heading_path` hierarchy
- **Cross-references** — captions link to their tables/pictures, co-occurring parts link via `related`
- **Image data** — every image part has a `data_uri` (from pictures[] or page-level fallback)

**Who consumes it?** Topic generation reads `heading_path` to build the topic hierarchy. Training data generation reads part text and headings to create prompts. The UI displays parts grouped by heading. If this file is missing or malformed, all downstream steps fail.

This is the output you produce. Every document extraction must result in a `knowledge_parts.json` file matching this schema.

```json
{
  "document": {
    "title": "Attention Is All You Need",
    "source_file": "1706.03762v7.pdf",
    "total_pages": 15
  },
  "extraction": {
    "method": "docling_hybrid",
    "total_chunks": 61,
    "extracted_at": "2026-03-10T15:30:00Z"
  },
  "parts": [
    {
      "id": "p-001",
      "type": "text",
      "text": "The dominant sequence transduction models are based on...",
      "heading": "Abstract",
      "heading_path": ["Abstract"],
      "pages": [1],
      "source_chunks": [2],
      "refs": {
        "related": ["p-002", "p-003"]
      },
      "doc_item": "#/texts/13"
    },
    {
      "id": "p-010",
      "type": "table",
      "text": "| Layer Type | Complexity per Layer | Sequential Ops | Max Path |\n|---|---|---|---|\n| Self-Attention | O(n²·d) | O(1) | O(1) |\n...",
      "heading": "3.4 Embeddings and Softmax",
      "heading_path": ["3 Model Architecture", "3.4 Embeddings and Softmax"],
      "pages": [6],
      "source_chunks": [20, 21],
      "table": {
        "num_rows": 5,
        "num_cols": 4,
        "headers": ["Layer Type", "Complexity per Layer", "Sequential Operations", "Maximum Path Length"],
        "rows": [
          ["Self-Attention", "O(n²·d)", "O(1)", "O(1)"],
          ["Recurrent", "O(n·d²)", "O(n)", "O(n)"]
        ]
      },
      "refs": {
        "caption": "p-011",
        "related": ["p-009"]
      },
      "doc_item": "#/tables/0"
    },
    {
      "id": "p-011",
      "type": "text",
      "text": "Table 1: Maximum path lengths, per-layer complexity and minimum number of...",
      "heading": "3.4 Embeddings and Softmax",
      "heading_path": ["3 Model Architecture", "3.4 Embeddings and Softmax"],
      "pages": [6],
      "source_chunks": [20],
      "refs": {
        "caption_for": "p-010"
      },
      "doc_item": "#/texts/115"
    },
    {
      "id": "p-020",
      "type": "image",
      "text": "",
      "heading": "3.2 Attention",
      "heading_path": ["3 Model Architecture", "3.2 Attention"],
      "pages": [3],
      "source_chunks": [8],
      "image": {
        "mimetype": "image/png",
        "width": 400,
        "height": 300,
        "data_uri": "data:image/png;base64,iVBORw0KGgo..."
      },
      "refs": {
        "caption": "p-021",
        "related": ["p-007", "p-008"]
      },
      "doc_item": "#/pictures/0"
    }
  ]
}
```

### Schema rules

1. **Every part has**: `id`, `type` (text|table|image), `text`, `heading`, `heading_path`, `pages`, `source_chunks`, `refs`, `doc_item`
2. **`text` is always a string** — for tables it's the markdown rendering, for images it's empty string `""`. This keeps backward compatibility with text-only consumers.
3. **`table`** field only present on type=table: `headers` (string array), `rows` (2D string array), `num_rows`, `num_cols`
4. **`image`** field only present on type=image: `mimetype`, `width`, `height`, `data_uri` (base64 data URI). Always populated — Docling is called with `include_images=true` + `image_export_mode=embedded`.
5. **`refs`** links parts together:
   - `caption` → part ID of the caption text (on table/image parts)
   - `caption_for` → part ID of what this text captions (on caption text parts)
   - `related` → part IDs of co-occurring items (from the same Docling chunk)
6. **`heading_path`** is the full heading hierarchy from root to leaf. `heading` is the leaf (last element).
7. **Flat list** — no sections grouping. Parts are ordered by document position. Consumers group by `heading_path` if needed.
8. **`doc_item`** — JSON pointer back to the DoclingDocument item for traceability (e.g., `#/texts/13`, `#/tables/0`, `#/pictures/0`)

The formal JSON Schema is at `reference/knowledge-parts-schema.json` — use it to validate your output.

**This schema is mandatory.** Do not invent alternative formats (e.g., normalized chunk lists, cleaned chunk JSON). Downstream consumers — topic generation, training data creation, and the UI — all expect `knowledge_parts.json` with typed parts, cross-references, and image data. If you skip this step, the entire pipeline breaks.

---

## Section 4: How to Create Parts

**You must produce `knowledge/knowledge_parts.json` matching the Section 3 schema.** This is not optional. Normalized chunks, cleaned chunk lists, or any other intermediate format are NOT the deliverable — they are steps along the way. The final output must be a flat `parts[]` array where every part has `id`, `type` (text|table|image), `heading_path`, `refs`, and `doc_item`. Image parts must have `data_uri` (use page fallback if needed). Caption links must be bidirectional.

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

1. **Track heading context** from `chunk.headings` — these give you `heading` and `heading_path`
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
- Use `item.text` as the part's `text`
- Skip items with `label` = `page_header` or `page_footer` (noise)
- Items with `label` = `caption` should still become parts — they'll be linked via `refs`
- Items with `label` = `section_header` can be skipped OR included depending on whether the heading adds value beyond what `heading_path` provides

**For table items** (`#/tables/N`):
- Extract `data.table_cells` into `headers` and `rows`:
  - Cells with `column_header: true` → headers array (use `start_col_offset_idx` for ordering)
  - Remaining cells → rows (use `start_row_offset_idx` and `start_col_offset_idx`)
  - Handle `row_span`/`col_span` for merged cells
- Render a markdown table for the `text` field
- Resolve `captions` pointers to find the caption text

**For picture items** (`#/pictures/N`) — discovered via caption `parent.$ref`, not from chunk `doc_items`:
- When processing a caption text item whose `parent.$ref` points to `#/pictures/N`, create both the caption text part AND the image part
- **Primary**: use `item.image` if present — this is the individual figure cropped by layout analysis (typically ~300-500px). Extract `mimetype`, `size.width`, `size.height`, `uri` → `data_uri`.
- **Fallback**: if `item.image` is `null` (common on CPU — all pictures may be null), use the page-level render from `doc["pages"][str(page_no)]["image"]` instead. **Warning**: page images are full-page renders (~964x1332px), not cropped figures. Add `"source": "page"` to the image field so consumers know the difference.
- Page images from `pages{}` are **always available** when `convert_include_images=true`
- Set `text` to `""` (empty string)
- Link the image part to its caption part immediately (bidirectional `caption`/`caption_for` refs)

### Step 5: Build cross-references

After creating all parts, link them:

**Caption links**: For each table/picture part that has captions:
1. Find the caption text part (by matching `doc_item` to the resolved caption pointer)
2. Set `table_or_picture_part.refs.caption = caption_part.id`
3. Set `caption_part.refs.caption_for = table_or_picture_part.id`

**Related links**: Parts whose doc_items appeared in the same chunk are related:
1. Group parts by the chunks they appeared in
2. For each group, add all other part IDs to each part's `refs.related`

### Step 6: Assign IDs and output

- Assign sequential IDs: `p-001`, `p-002`, etc.
- Sort parts by first appearance (first `source_chunks` value)
- Wrap in the `knowledge_parts.json` envelope with `document` and `extraction` metadata
- Write to `knowledge/knowledge_parts.json`

### Step 7: Validate Output

Before finalizing `knowledge_parts.json`, run these checks:

1. **Sample 10 parts and verify headings make sense** — headings should be real section titles, not chess moves, page numbers, or noise. If headings look wrong, fix the extraction logic (add domain-specific filters, rebuild heading hierarchy from the document structure).
2. **Check image parts have non-null `data_uri`** — every type=image part must have image data. If any are null, use the page-level fallback from `pages{}`.
3. **Verify caption links are bidirectional** — if part A has `refs.caption = "p-011"`, then p-011 must have `refs.caption_for = A's id`. Missing links break downstream consumers.
4. **Count parts by type** — does the distribution make sense for this document? A 200-page textbook with 0 image parts is suspicious. A chess book with 50 text parts and 0 images missed all the board diagrams.
5. **Spot-check text content** — read a few text parts. Are they meaningful content or garbled OCR noise?

If validation reveals problems, fix the extraction script and re-run — don't ship bad parts downstream.

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

## Section 5: Fallback (pdftotext)

When Docker is not available, use `pdftotext` for basic text extraction:

```bash
pdftotext input.pdf output.txt
```

If `pdftotext` is not found, try `/opt/homebrew/bin/pdftotext` (macOS) or install: `brew install poppler` / `apt-get install poppler-utils`.

Then run the section extraction template:

```bash
python3 .claude/skills/vllora-finetune/templates/extract-sections.py \
  knowledge/converted.md knowledge/sections.json
```

This produces the flat `{document_title, sections: [{section_heading, section_text}]}` format. Note: pdftotext loses tables, images, and complex layout — use Docling Serve when possible.

---

## Section 6: Options Reference

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
