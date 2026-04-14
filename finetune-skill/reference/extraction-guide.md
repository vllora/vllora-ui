# Document Extraction Guide

Extract structured knowledge parts from PDFs. The pipeline auto-routes each document to the right extractor:

- **OpenDataLoader PDF (ODL)** — local, deterministic, no Docker. Used for digital PDFs (selectable text). Fast (Java-only).
- **OpenDataLoader Hybrid (ODL Hybrid)** — server-backed OCR + table recognition via the docling-fast backend. Used for scanned PDFs and complex pages. The client points at `opendataloader-pdf-hybrid`, which can be auto-managed locally or supplied via `--hybrid-url`.
- **pdftotext fallback** — degraded text-only fallback when ODL tooling is unavailable.

Both the ODL and ODL Hybrid paths produce the same `kids[]` JSON format, so downstream scripts (`build_knowledge_parts.py`, `consolidate_parts.py`, `validate_extraction.py`) work identically regardless of which backend was used.

**Your deliverable is a `knowledge_parts.json` per document** (stored in `knowledge/{doc-slug}/knowledge_parts.json`, where `{doc-slug}` is the slugified filename) — a typed, linked parts file matching the schema in Section 3. Every text passage, table, and image becomes a `source_part` with a title, extraction path, and provenance metadata.

**Multi-document note**: each document gets its own subdirectory named by slugifying the filename (e.g., `knowledge/chess-tactics/`). Prefix part IDs with a document identifier (e.g., `chess-tactics-chapter-3`) to keep them unique when merging. See SKILL.md Step 2 for the full workflow.

---

## Section 1: Run the extraction router

The single entry point is `scripts/extract_router.py`. It auto-detects digital vs scanned PDFs and dispatches:

```
extract_router.py  →  is_digital_pdf(pdf)?
                        ├── yes → odl_extract.py hybrid=off        (local Java, fast)
                        └── no  → odl_extract.py hybrid=docling-fast (server-backed OCR+tables)
```

### Prerequisites

**Java 11+** and the OpenDataLoader Python package with hybrid extras:

```bash
java -version 2>&1 | grep -qE 'version "(1[1-9]|[2-9][0-9])' || echo "ERROR: Java 11+ required"
pip install -U "opendataloader-pdf[hybrid]"
```

No Docker is required. The `[hybrid]` extras install the client and backend tooling. Hybrid mode uses the `opendataloader-pdf-hybrid` server:

```bash
opendataloader-pdf-hybrid --port 5002 --force-ocr
```

The finetune skill can auto-manage this backend locally. If you prefer to run your own backend, point the client at it with `--hybrid-url http://127.0.0.1:5002`.

### Single-file extraction

```bash
uv run scripts/extract_router.py document.pdf   -o knowledge/{doc-slug}/extraction-result.json
```

Output:
- `extraction-result.json` — the backend's raw JSON. Always `kids[]` tree format for ODL and ODL Hybrid extractions.
- `extraction-status.json` (sibling file) — records `backend: "odl" | "odl_hybrid"`, `used_struct_tree`, `pages`, `elements`, `duration_seconds`. When hybrid mode was used, it also records `hybrid_backend`, `hybrid_mode`, `hybrid_url`, backend lifecycle metadata, and requested/applied backend OCR options.

### Batch mode

```bash
uv run scripts/extract_router.py --batch   doc1.pdf:knowledge/doc1/extraction-result.json   doc2.pdf:knowledge/doc2/extraction-result.json
```

ODL spawns one JVM per `convert()` call, so batching digital PDFs into a single call is much faster than per-file. The router groups by backend automatically.

### Useful flags

- `--force odl|odl_hybrid` — bypass auto-detection
- `--skip-existing` — reuse valid `extraction-result.json` from prior runs
- `--no-struct-tree` — [ODL] disable tagged-PDF structure tree, force XY-Cut++ layout
- `--table-method default|cluster` — [ODL] table detector (default: `cluster`, better accuracy)
- `--hybrid-url http://127.0.0.1:5002` — [ODL Hybrid] explicit backend URL
- `--hybrid-host / --hybrid-port` — [ODL Hybrid] where to start the auto-managed backend
- `--hybrid-autostart / --no-hybrid-autostart` — [ODL Hybrid] start a local backend automatically (default: True)
- `--hybrid-mode full` — [ODL Hybrid] request full backend output; needed for picture descriptions
- `--hybrid-fallback / --no-hybrid-fallback` — [ODL Hybrid] fall back to Java-only on error (default: True)
- `--hybrid-timeout 60000` — [ODL Hybrid] backend timeout in ms (default: 60000)
- `--backend-force-ocr` — [ODL Hybrid] when auto-managing the backend, start it with `--force-ocr`
- `--backend-ocr-lang en,ko` — [ODL Hybrid] when auto-managing the backend, start it with `--ocr-lang`
- `--backend-enrich-picture-description` — [ODL Hybrid] when auto-managing the backend, enable picture descriptions
- `--ocr-lang`, `--force-ocr` — deprecated aliases retained for one release

### ODL response shape (both digital and hybrid paths)

Both the ODL (digital) and ODL Hybrid (scanned) paths emit the same `kids[]` tree in reading order. The hybrid path can additionally include `description` fields on picture elements when the backend is started with picture description enrichment and the client uses `--hybrid-mode full`.

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
      "font": "Helvetica",
      "font size": 11,
      "content": "The dominant sequence transduction models are based on..."
    }
  ]
}
```

Key fields (note the spaces in field names):
- **`type`** — `"paragraph" | "heading" | "image" | "table" | "list_item" | "caption" | "header" | "footer"`
- **`bounding box`** — `[l, b, r, t]` in PDF points, bottom-left origin. Translated to `{page, l, t, r, b, coord_origin: "BOTTOMLEFT"}` when written into `extraction_metadata.bboxes` so it matches the Docling format consumed by `PdfHighlightViewer`.
- **`page number`** — integer page, 1-indexed
- **`heading level`** — 1..6 when present (indicates ODL consumed the tagged-PDF structure tree; absent elements fell back to XY-Cut++ layout)
- **`content`** — text (present on text-ish types)
- **`source` / `data` / `format`** — image payload, when `type == "image"`

`build_knowledge_parts.py` auto-detects this shape (`"kids" in data`) and switches to the heading-aware parser. `header` and `footer` elements are filtered as noise; headings open new sections and the enclosed paragraphs/tables/lists are grouped under them with a breadcrumb into `extraction_metadata.parent_section`.

## Section 1.5: Read the Document

**Before writing a custom extraction script**, you must read and understand the document. Blindly transforming extraction output without understanding the content produces garbage — chess moves become headings, noise pages become parts, and domain-specific patterns get lost.

### What to do

After saving `knowledge/extraction-result.json`:

1. **Read the first 10-20 elements** (from the `kids[]` array) — understand the document title, content type (textbook? reference manual? game collection?), heading patterns, and key entities
2. **Sample elements from the middle and end** — verify the structure stays consistent, note any shifts in content type
3. **Identify real headings vs noise** — ODL marks elements based on the PDF structure tree or XY-Cut++ layout. Chess moves like "31... Rxd5" should NOT be headings. Page numbers, running headers, and chapter markers may appear as headings too.
4. **Note domain-specific patterns** — game notation, mathematical formulas, code blocks, multi-column layouts, glossary entries. These need special handling in a custom extraction script.
5. **Check for images** — look for `type: "image"` elements. With hybrid mode, these may include `description` fields from the SmolVLM model.

### Why this matters

This understanding directly informs custom extraction scripts:
- You can add **domain-specific heading filters** (e.g., skip chess move notation mistakenly labeled as headings)
- You can decide **which heading hierarchy to trust** vs reconstruct
- You can add **noise removal** for content that shouldn't become parts (title pages, copyright, blank pages)

Skip this step and you'll produce knowledge parts full of noise that hurt downstream training data quality.

---

## Section 2: Build `knowledge_parts.json`

**You must produce a `knowledge_parts.json` per document** (in `knowledge/{doc-slug}/knowledge_parts.json`, where `{doc-slug}` is the slugified filename) matching the Section 3 schema. This is not optional. The final output must have a `source` object and a flat `parts[]` array where every part has `id`, `source_id`, `type` (text|table|image), `content`, `title`, and `extraction_path`. Image parts must have the base64 data URI as `content`. Caption links must be bidirectional via `content_metadata`.

**Important**: Prefix all part IDs with the document identifier — typically the slugified filename — to keep them unique when parts from multiple documents are merged into `all-parts-index.json`.

**Default path: use `scripts/build_knowledge_parts.py`.** It expects OpenDataLoader `kids[]` extraction output and produces a conformant `knowledge_parts.json` with `semantic_type`, `heading_level`, `parent_section`, and `tag_source` metadata. Tables are schema-driven (`rows/cells`, not flattened text), lists are preserved as markdown text parts, and captions remain separate linked text parts. Only write a custom script when the document has domain-specific heading noise or cross-referencing logic the generic parser cannot handle.

### Step 1: Load the response

```python
import json

with open("knowledge/{doc-slug}/extraction-result.json") as f:
    result = json.load(f)

kids = result["kids"]
```

### Step 2: Build parts

Use `build_knowledge_parts.py` as the default. It will:
- detect heading structure from ODL `heading` elements
- preserve tables as `type: "table"` with `content_metadata.headers/rows`
- preserve images as `type: "image"` with data URIs when available
- keep captions as separate text parts and link them to their target parts

### Step 3: Validate output

Your `knowledge_parts.json` should:
- contain non-empty `parts[]`
- preserve document order
- exclude header/footer noise
- maintain page provenance in `extraction_metadata.pages`
- include structured table metadata where tables exist

## Section 5: Upload to Gateway

After producing `knowledge_parts.json` for each document (in `knowledge/{doc-slug}/`), upload each source document and its parts to the gateway. **Repeat these two steps for each document.**

### Step 1: Create Knowledge Source (multipart)

Upload the original file along with metadata. The API requires `multipart/form-data` — not JSON.

```bash
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "description=Source document for training data" \
  -F 'metadata={"total_pages":84,"extraction_method":"odl_hybrid","total_chunks":61}')
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

When OpenDataLoader tooling is not available, use `pdftotext` for a degraded text-only extraction:

```bash
pdftotext input.pdf output.txt
```

If `pdftotext` is not found, try `/opt/homebrew/bin/pdftotext` (macOS) or install: `brew install poppler` / `apt-get install poppler-utils`.

Then parse the text output into `knowledge_parts.json` format. Note: pdftotext loses tables, images, and complex layout — prefer ODL / ODL Hybrid whenever possible.
