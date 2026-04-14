# PDF Extraction Improvements Research

> **Status: Implemented (2026-04)** — The Tiered Extraction architecture proposed in [Recommended Pipeline Changes](#recommended-pipeline-changes) shipped: `scripts/extract_router.py` routes digital PDFs to `scripts/odl_extract.py` (OpenDataLoader PDF, local, deterministic) and falls back to `scripts/docling_extract.py` only for scanned/OCR-needed PDFs. Chunking is now owned solely by `scripts/build_knowledge_parts.py` (heading-aware via ODL's semantic tree). The Docling Docker configuration appendix below is still accurate for the OCR-fallback path. The rest of this document is preserved as the research record that motivated the migration.

Research into improving extraction quality for the vLLora finetune skill pipeline. Covers four problem areas: image extraction, content fragmentation, processing speed, and overall extraction quality.

**Date**: 2026-03-19
**Context**: Chess Tactics PDF (84 pages, 80+ board diagrams, text-based chess notation)
**Current tool (at time of writing)**: Docling Serve (CPU Docker, localhost:5001). **Current primary (2026-04+):** OpenDataLoader PDF, with Docling retained as OCR fallback.

---

## Table of Contents

1. [Problem 1: Images/Diagrams Not Extracted](#problem-1-imagesdiagrams-not-extracted)
2. [Problem 2: Content Too Fragmented](#problem-2-content-too-fragmented)
3. [Problem 3: Docling Is Slow](#problem-3-docling-is-slow)
4. [Problem 4: Low Teaching Quality in Extracted Content](#problem-4-low-teaching-quality-in-extracted-content)
5. [Tool Comparison Table](#tool-comparison-table)
6. [Recommended Pipeline Changes](#recommended-pipeline-changes)
7. [Quick Wins vs Longer-Term Improvements](#quick-wins-vs-longer-term-improvements)

---

## Problem 1: Images/Diagrams Not Extracted

### Root Cause Analysis

The chess board diagrams in this PDF are **not embedded image objects** — they are rendered using a chess font (e.g., Chess Merida, Chess Alpha, or a similar specialty typeface). The PDF contains Unicode or private-use-area characters that render as chess pieces when the chess font is installed, but to any text extraction tool they appear as ASCII garbage (`!""""""""#`, `+--------,`, etc.).

This is a fundamental limitation: **Docling, PyMuPDF, and every other PDF extraction tool can only extract images that exist as embedded XObject streams in the PDF**. Font-rendered diagrams are text, not images — there is nothing in the `pictures[]` array because there are no pictures in the PDF file structure.

### What Docling Can and Cannot Do

| Capability | Status | Notes |
|-----------|--------|-------|
| Extract embedded raster images (PNG/JPEG XObjects) | Works | `convert_include_images=true` + `convert_image_export_mode=embedded` |
| Extract vector graphics (SVG-like drawings) | Partial | Docling's layout model may detect some figures, but vector graphics extraction is limited |
| Detect figures from visual layout (bounding boxes) | Works for some | The layout model can identify figure regions, but needs `generate_picture_images=true` in pipeline options |
| Extract text rendered with specialty fonts | Text only | Font-rendered chess diagrams become garbled text — Docling correctly extracts the characters but they are meaningless without the font |
| OCR of font-rendered diagrams | Does not help | OCR sees the same glyphs that text extraction sees — the problem is semantic, not visual |

### Actionable Recommendations

#### 1A. Page-Level Screenshot + Vision LLM (Best for chess diagrams)

Render each page as an image and use a vision LLM to describe the chess position:

```python
# PyMuPDF renders pages to images (fast, no Docker needed)
import fitz  # PyMuPDF

doc = fitz.open("chess-tactics.pdf")
for page_num in range(len(doc)):
    page = doc[page_num]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x scale for quality
    pix.save(f"page_{page_num:03d}.png")
```

Then send pages containing chess diagrams to a vision model (GPT-4o, Claude) with a prompt like: "Describe the chess position on this board. Provide the FEN notation and explain the tactical theme."

**Cost estimate**: ~$0.01-0.03 per page with GPT-4o mini. For 84 pages: ~$1-2.50 total.

#### 1B. ASCII-to-FEN Conversion (Programmatic, free)

The garbled text follows patterns that map to chess piece positions. A custom parser can convert these ASCII patterns to FEN notation:

```python
# Chess font character mapping (varies by font — inspect the actual chars)
PIECE_MAP = {
    "K": "K", "Q": "Q", "R": "R", "B": "B", "N": "N", "P": "P",  # White
    "k": "k", "q": "q", "r": "r", "b": "b", "n": "n", "p": "p",  # Black
    " ": "1",  # Empty square (adjust based on actual encoding)
}

def ascii_board_to_fen(lines: list[str]) -> str:
    """Convert 8 lines of ASCII chess board to FEN notation."""
    ranks = []
    for line in lines:
        # Strip border characters, map pieces
        rank = ""
        empty_count = 0
        for char in line:
            if char in PIECE_MAP:
                if PIECE_MAP[char] == "1":
                    empty_count += 1
                else:
                    if empty_count > 0:
                        rank += str(empty_count)
                        empty_count = 0
                    rank += PIECE_MAP[char]
        if empty_count > 0:
            rank += str(empty_count)
        ranks.append(rank)
    return "/".join(ranks)
```

The `python-chess` library can then validate and render these positions:

```python
import chess
import chess.svg

board = chess.Board(fen_string)
is_valid = board.is_valid()
svg = chess.svg.board(board)  # Render as SVG
```

**Trade-off**: Requires identifying the exact font encoding used in this specific PDF. Inspect the raw text output to map characters to pieces.

#### 1C. PyMuPDF Region Extraction (Hybrid approach)

Use PyMuPDF to detect text blocks that contain chess font characters, compute their bounding box, and render just that region as an image:

```python
import fitz

doc = fitz.open("chess-tactics.pdf")
page = doc[0]

# Find text blocks with chess font characters
for block in page.get_text("dict")["blocks"]:
    for line in block.get("lines", []):
        for span in line["spans"]:
            if span["font"].startswith("Chess"):  # Identify chess font
                # Render this region as image
                clip = fitz.Rect(block["bbox"])
                pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(3, 3))
                pix.save(f"diagram_{page.number}_{block['number']}.png")
```

This is faster than full-page screenshots and produces cropped diagram images.

#### 1D. Docling `generate_page_images=true` + Post-Processing

Docling can render full-page images via the `pages{}` dictionary in the document structure. Currently the extraction guide mentions checking `pages{}` as a fallback. Configure Docling to always generate page images:

```
convert_generate_page_images=true
```

Then crop diagram regions from the page images using the bounding box coordinates from the text extraction (since we know where the chess font text appears).

### Recommendation

**For the chess PDF specifically**: Use approach 1B (ASCII-to-FEN) as the primary strategy — it is free, fast, and produces structured data (FEN notation) that is far more useful for training than raw images. Use approach 1A (Vision LLM) as a fallback for diagrams where the ASCII parsing fails.

**For the general pipeline**: Add PyMuPDF as a lightweight image extraction step (approach 1C) that runs alongside Docling text extraction. This handles the common case of PDFs with embedded images that Docling misses due to layout detection limitations.

---

## Problem 2: Content Too Fragmented

### Current State

- 215 chunks from 84 pages (avg 2.5 chunks/page)
- After consolidation: 193 parts, most under 300 characters
- Section headers disconnected from their game examples
- A section like "3.1 Forks" has 10 games, each as a separate tiny chunk
- Teaching context (what tactical theme each game illustrates) is lost

### Root Cause

The `chunking_max_tokens=1024` setting is not the problem — 1024 tokens is generous. The issue is that **Docling's HybridChunker splits on document structure boundaries** (headings, paragraphs), and chess game annotations are structurally separate elements. Each game has its own heading-like notation (e.g., "Game 31: Fischer vs. Spassky"), which Docling treats as a section break.

The `chunking_merge_peers=true` setting (already enabled) merges adjacent chunks under the same heading, but if each game has its own sub-heading, they remain separate.

### Actionable Recommendations

#### 2A. Increase `chunking_max_tokens` to 2048-4096

This is the simplest change. A larger token budget allows the HybridChunker to merge more content into single chunks:

```python
# In docling_extract.py submit_async()
data = {
    "chunking_max_tokens": "4096",  # Was 1024
    # ... rest unchanged
}
```

**Why 4096**: Fine-tuning contexts are typically 2048-8192 tokens. A 4096-token chunk preserves the section header + multiple game examples together, maintaining teaching context. This is not RAG retrieval where small chunks matter — for fine-tuning, larger, more coherent chunks produce better training data.

**Expected impact**: 215 chunks should reduce to ~60-80 chunks, with section headers and their games grouped together.

#### 2B. Post-Processing: Section-Aware Merging

After Docling extraction, merge chunks that share the same parent heading:

```python
def merge_by_section(chunks: list[dict]) -> list[dict]:
    """Merge chunks that share the same top-level heading."""
    merged = []
    current_section = None
    current_text_parts = []

    for chunk in chunks:
        top_heading = chunk["headings"][0] if chunk.get("headings") else None

        if top_heading != current_section and current_text_parts:
            merged.append({
                "heading": current_section,
                "content": "\n\n".join(current_text_parts),
                "page_numbers": [],  # Aggregate from chunks
            })
            current_text_parts = []

        current_section = top_heading
        current_text_parts.append(chunk["text"])

    # Flush last section
    if current_text_parts:
        merged.append({
            "heading": current_section,
            "content": "\n\n".join(current_text_parts),
        })

    return merged
```

This preserves the "3.1 Forks" heading with all 10 game examples beneath it.

#### 2C. Use Docling's HierarchicalChunker Instead

The `HierarchicalChunker` produces one chunk per structural element without token-based splitting/merging. Combined with post-processing (2B), this gives full control over how content is grouped:

```
# API parameter (if supported by docling-serve)
chunking_strategy=hierarchical
```

Then apply custom merging logic in the extraction script that understands domain-specific boundaries (e.g., "merge everything under the same chapter section").

#### 2D. Minimum Part Size Threshold

In the consolidation step, skip or merge parts that are too small:

```python
MIN_PART_CHARS = 500  # Minimum characters for a standalone part

def consolidate_with_minimum(parts: list[dict]) -> list[dict]:
    """Merge parts below minimum size with their neighbors."""
    result = []
    buffer = None

    for part in parts:
        if buffer is None:
            buffer = part
        elif len(buffer["content"]) < MIN_PART_CHARS:
            # Merge into buffer
            buffer["content"] += "\n\n" + part["content"]
        else:
            result.append(buffer)
            buffer = part

    if buffer:
        result.append(buffer)

    return result
```

### Recommendation

**Immediate**: Change `chunking_max_tokens` from 1024 to 4096 (recommendation 2A). This is a one-line change that should cut fragmentation by 60-70%.

**Follow-up**: Add section-aware merging in the extraction script (2B) to handle cases where even 4096 tokens is not enough to keep a section together.

---

## Problem 3: Docling Is Slow

### Current Performance

| Document | Pages | Time | Rate |
|----------|-------|------|------|
| Chess Tactics PDF | 84 | ~2 min | 42 pages/min |
| Large reference | 282 | ~12 min | 23 pages/min |

The bottleneck is the CPU-based Docling Serve container. Processing involves: PDF parsing, layout detection (deep learning model), OCR (if enabled), table structure detection (deep learning model), and chunking.

### Actionable Recommendations

#### 3A. Disable OCR for Text-Based PDFs (Quick Win)

The chess PDF is a digitally-created PDF — text is embedded, not scanned. OCR is unnecessary and adds significant processing time:

```python
# In docling_extract.py submit_async()
data = {
    "convert_do_ocr": "false",  # Was "true" — skip for digital PDFs
    # ... rest unchanged
}
```

**Expected speedup**: 30-50% faster. OCR is one of the most expensive steps.

**Implementation**: Add a `--no-ocr` flag to `docling_extract.py` and let the skill decide based on the document type. The SKILL.md extraction step should instruct the agent: "If the PDF has selectable text (digital PDF), use `--no-ocr`. If it's a scanned document, keep OCR enabled."

#### 3B. Use GPU Docling Image (Moderate Effort)

Switch from `docling-serve-cpu` to the CUDA image:

```bash
docker run --gpus all -p 5001:5001 ghcr.io/docling-project/docling-serve-cu128:latest
```

**Expected speedup**: 3-5x for layout detection and table structure models. OCR may also benefit.

**Requirement**: NVIDIA GPU with CUDA support. Not available on all developer machines (notably, not on Apple Silicon Macs — but relevant for Linux CI/servers).

#### 3C. Tune Docling Serve Worker Configuration

Environment variables that affect throughput:

```bash
docker run -p 5001:5001 \
  -e DOCLING_SERVE_ENG_LOC_NUM_WORKERS=4 \
  -e DOCLING_SERVE_OCR_BATCH_SIZE=8 \
  -e DOCLING_SERVE_LAYOUT_BATCH_SIZE=8 \
  -e DOCLING_SERVE_TABLE_BATCH_SIZE=8 \
  ghcr.io/docling-project/docling-serve-cpu:latest
```

- `DOCLING_SERVE_ENG_LOC_NUM_WORKERS`: Default is 2. Increase to 4 if the machine has enough RAM (each worker loads the models — expect ~2GB per worker).
- Batch sizes: Larger batches = fewer model invocations = faster, but more RAM.

#### 3D. Use PyMuPDF for Text + Docling Only for Structure (Hybrid)

For digital PDFs, PyMuPDF extracts text 100x faster than Docling:

```python
import fitz
import time

start = time.time()
doc = fitz.open("chess-tactics.pdf")
for page in doc:
    text = page.get_text("dict")  # Structured text with fonts, sizes, positions
elapsed = time.time() - start
print(f"PyMuPDF: {elapsed:.1f}s for {len(doc)} pages")
# Typical: < 1 second for 84 pages
```

**Strategy**: Use PyMuPDF for text extraction (fast), and only invoke Docling for documents that need table structure or layout analysis. The `pdftotext_extract.py` fallback already exists — enhance it with PyMuPDF's structured output (font info, bounding boxes) for better heading detection.

#### 3E. Use Marker as an Alternative

Marker achieves ~25 pages/second on GPU (H100), significantly faster than Docling:

```bash
pip install marker-pdf
marker_single chess-tactics.pdf --output_format json
```

Marker outputs structured JSON with headings, paragraphs, tables, and images. It also has a chunking mode (`--output_format chunks`) suitable for RAG/fine-tuning.

**Trade-off**: Marker uses a modified license (free for research/personal use, startups under $2M revenue). Commercial use beyond that threshold requires a paid license.

#### 3F. Document Splitting for Parallel Processing

Split the PDF into page ranges and process in parallel:

```bash
# Using PyMuPDF to split
python -c "
import fitz
doc = fitz.open('chess-tactics.pdf')
for i in range(0, len(doc), 20):
    chunk = fitz.open()
    chunk.insert_pdf(doc, from_page=i, to_page=min(i+19, len(doc)-1))
    chunk.save(f'chunk_{i//20}.pdf')
"

# Submit all chunks to Docling in parallel (batch mode already supported)
uv run scripts/docling_extract.py --batch \
  chunk_0.pdf:out/chunk_0.json \
  chunk_1.pdf:out/chunk_1.json \
  chunk_2.pdf:out/chunk_2.json \
  chunk_3.pdf:out/chunk_3.json \
  chunk_4.pdf:out/chunk_4.json
```

**Expected speedup**: With 4 workers, a 282-page PDF could process in ~3-4 minutes instead of 12.

**Caveat**: Cross-page content (tables spanning pages, continued sections) may break at split boundaries.

### Recommendation

**Immediate**: Disable OCR for digital PDFs (3A) — one flag change, 30-50% speedup.

**Short-term**: Tune worker/batch configuration (3C) and use document splitting for large PDFs (3F).

**Medium-term**: Add PyMuPDF as a fast-path for digital PDFs (3D). Only route to Docling when structural extraction (tables, complex layouts) is needed.

**Long-term**: Evaluate GPU Docling (3B) for server deployments, or switch to Marker (3E) if licensing permits.

---

## Problem 4: Low Teaching Quality in Extracted Content

### Root Cause

This is primarily a **content problem, not an extraction problem**. The chess tactics PDF is mostly game annotations — move sequences with brief positional comments. Only ~2% of the content is explanatory prose (the section introductions explaining tactical themes). This is typical for chess annotation books.

### Actionable Recommendations

#### 4A. LLM-Based Enrichment (Post-Extraction)

After extraction, use an LLM to generate teaching-quality content from the raw annotations:

```
For each knowledge part containing game annotations:
1. Parse the game notation
2. Identify the key tactical moment
3. Generate a teaching explanation:
   - What is the tactical theme? (fork, pin, skewer, etc.)
   - What is the key move and why does it work?
   - What should the student look for in similar positions?
4. Store both the original annotation AND the generated explanation
```

This transforms "1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6 dxc6 5.d4 exd4 6.Qxd4 Qxd4 7.Nxd4" into: "This game demonstrates the Exchange Variation of the Ruy Lopez. White trades bishop for knight to double Black's c-pawns, creating a structural advantage..."

**Cost**: ~$0.005-0.01 per game example with GPT-4o mini. For 100 games: ~$0.50-1.00.

**When to do this**: During Step 4 (Data Generation) of the pipeline, not during extraction. The extraction step should faithfully capture the source content; enrichment is a generation concern.

#### 4B. Section-Level Context Injection

Prepend the section introduction to each game annotation within that section:

```
Before: "Game 31: 1.e4 e5 2.Nf3 Nc6..."
After:  "[Section: 3.1 Forks — A fork attacks two pieces simultaneously.
         The knight is the most common forking piece because it attacks
         in a pattern that other pieces cannot block.]
         Game 31: 1.e4 e5 2.Nf3 Nc6..."
```

This preserves the teaching context without generating new content. It depends on fixing Problem 2 (fragmentation) first — the section introduction must be in the same knowledge part as its games.

#### 4C. Quality Scoring During Consolidation

Add a quality score to each knowledge part based on:

- **Text density**: Ratio of prose words to notation symbols
- **Explanation markers**: Presence of words like "because", "this demonstrates", "notice how"
- **Length**: Parts under 200 characters are likely just move sequences

```python
def score_teaching_quality(content: str) -> float:
    """Score 0-1 based on teaching content density."""
    words = content.split()
    notation_chars = sum(1 for c in content if c in "0123456789.+-=KQRBNOx")
    prose_ratio = 1 - (notation_chars / max(len(content), 1))

    explanation_words = {"because", "demonstrates", "notice", "key", "important",
                         "idea", "theme", "tactic", "strategy", "advantage"}
    explanation_count = sum(1 for w in words if w.lower() in explanation_words)

    return min(1.0, prose_ratio * 0.6 + min(explanation_count / 5, 1.0) * 0.4)
```

Parts with scores below a threshold can be flagged for LLM enrichment in Step 4.

### Recommendation

**This is a Step 4 (Data Generation) concern, not a Step 2 (Extraction) concern.** The extraction step should faithfully capture what is in the document. The data generation step should enrich low-quality parts with LLM-generated teaching explanations. The key enabler is fixing Problem 2 first — once section headers stay with their content, the data generation agent has the context it needs.

---

## Tool Comparison Table

| Tool | Speed (84pg) | Images | Tables | Structure | Chunking | Cost | Setup |
|------|-------------|--------|--------|-----------|----------|------|-------|
| **Docling Serve (CPU)** | ~2 min | Embedded only | Excellent | Excellent | Built-in (HybridChunker) | Free (OSS) | Docker container |
| **Docling Serve (GPU)** | ~30-40s est. | Embedded only | Excellent | Excellent | Built-in | Free (OSS) | Docker + NVIDIA GPU |
| **PyMuPDF (fitz)** | < 1s | Embedded + render | None | Basic (fonts, bbox) | None (DIY) | Free (AGPL) | `pip install pymupdf` |
| **Marker** | ~3-5s (GPU) | Extract + describe | Good (with LLM) | Good (MD headings) | Built-in (chunks format) | Free < $2M rev | `pip install marker-pdf` |
| **pdftotext (poppler)** | < 1s | None | None | None (flat text) | None (DIY) | Free (OSS) | `brew install poppler` |
| **Unstructured.io** | ~1-2 min | OCR-based | Good | Good | Built-in (partition) | Free (OSS) + paid cloud | `pip install unstructured` |
| **LlamaParse** | ~30s (cloud) | Yes (cloud LLM) | Good | Good | Built-in | Free tier + paid | API key required |
| **Vision LLM (GPT-4o)** | ~10-20s | Describes any visual | N/A | LLM-dependent | N/A | ~$0.01-0.03/page | API key required |

### Key Trade-offs

- **Docling**: Best structural extraction (tables, headings, body tree) but slowest and cannot handle font-rendered diagrams
- **PyMuPDF**: Fastest by far, gives font/position metadata, but no semantic structure or table parsing
- **Marker**: Good middle ground — fast, handles images, structured output — but GPL + commercial license restrictions
- **Vision LLM**: Best for understanding visual content (diagrams, charts) but expensive at scale and slow for batch processing

---

## Recommended Pipeline Changes

### Architecture: Tiered Extraction

> **Shipped 2026-04.** This section describes what was implemented: `extract_router.py` routes digital PDFs → `odl_extract.py` (OpenDataLoader) and falls back to `docling_extract.py` for scanned/OCR-needed PDFs. See `finetune-skill/reference/extraction-guide.md` for the current user-facing documentation.

Replace the current "Docling or pdftotext" binary choice with a tiered approach:

```
PDF Input
    │
    ├── Is it a digital PDF with selectable text?
    │   │
    │   YES ──► PyMuPDF fast extraction (< 1s)
    │   │       ├── Text with font/position metadata
    │   │       ├── Embedded image extraction
    │   │       └── Heading detection from font size/weight
    │   │
    │   │   Does it have complex tables?
    │   │   YES ──► Also run Docling (with do_ocr=false, max_tokens=4096)
    │   │   NO  ──► Skip Docling, use PyMuPDF output only
    │   │
    │   NO ──► Scanned PDF
    │           └── Docling with OCR enabled
    │
    ├── Does it contain specialty font diagrams (chess, music, math)?
    │   YES ──► ASCII-to-structured-data parser (domain-specific)
    │           OR Vision LLM for page screenshots
    │
    └── Post-processing
        ├── Section-aware merging (fix fragmentation)
        ├── Quality scoring (flag low-teaching-quality parts)
        └── knowledge_parts.json output
```

### Concrete Changes to Make

1. **`docling_extract.py`**: Add `--no-ocr` flag, increase default `--max-tokens` to 4096
2. **New script `pymupdf_extract.py`**: Fast extraction with font metadata and embedded image extraction
3. **Extraction guide**: Update to describe the tiered approach, when to use each tool
4. **SKILL.md Step 2**: Instruct the agent to check if the PDF is digital (selectable text) and choose the appropriate extraction path
5. **Consolidation step**: Add minimum part size threshold (500 chars) and section-aware merging

---

## Quick Wins vs Longer-Term Improvements

### Quick Wins (< 1 day each)

| Change | Impact | Effort | Files to Change |
|--------|--------|--------|----------------|
| Increase `chunking_max_tokens` to 4096 | 60-70% fewer fragments | 1 line | `docling_extract.py` |
| Add `--no-ocr` flag | 30-50% faster for digital PDFs | 10 lines | `docling_extract.py` |
| Tune Docker env vars (workers, batch sizes) | 20-30% faster | Docker config | Docker run command in extraction guide |
| Add minimum part size threshold in consolidation | Fewer tiny useless parts | 20 lines | Extraction script template |

### Short-Term (1-3 days each)

| Change | Impact | Effort | Files to Change |
|--------|--------|--------|----------------|
| Section-aware merging in post-processing | Teaching context preserved | ~100 lines | New consolidation logic |
| PyMuPDF-based fast extraction script | 100x faster for digital PDFs | ~200 lines | New `pymupdf_extract.py` |
| ASCII chess diagram detection + FEN conversion | Chess diagrams become structured data | ~150 lines | New domain-specific parser |

### Longer-Term (1-2 weeks)

| Change | Impact | Effort | Files to Change |
|--------|--------|--------|----------------|
| Tiered extraction pipeline (PyMuPDF + Docling + Vision LLM) | Best-of-breed for each document type | Architecture change | SKILL.md, extraction guide, scripts |
| Vision LLM integration for diagram-heavy documents | Understands any visual content | API integration | New script + SKILL.md |
| LLM-based enrichment of low-quality parts | Better training data quality | Step 4 enhancement | Data generation agent logic |
| Evaluate Marker as Docling replacement | Faster, simpler, built-in image extraction | Licensing review + integration | Multiple scripts and docs |

---

## Appendix: Docling Serve Configuration Reference

### Environment Variables (Docker)

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCLING_SERVE_ENG_LOC_NUM_WORKERS` | 2 | Number of worker threads |
| `DOCLING_SERVE_ENG_LOC_SHARE_MODELS` | false | Share model instances across workers (saves RAM) |
| `DOCLING_SERVE_OCR_BATCH_SIZE` | (auto) | OCR batch size |
| `DOCLING_SERVE_LAYOUT_BATCH_SIZE` | (auto) | Layout detection batch size |
| `DOCLING_SERVE_TABLE_BATCH_SIZE` | (auto) | Table structure batch size |
| `DOCLING_SERVE_MAX_NUM_PAGES` | unlimited | Max pages per document |
| `DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT` | 7 days | Processing timeout |
| `DOCLING_SERVE_LOAD_MODELS_AT_BOOT` | true | Pre-load models on startup |

### API Parameters (submit_async)

| Parameter | Current | Recommended | Why |
|-----------|---------|-------------|-----|
| `chunking_max_tokens` | 1024 | 4096 | Fewer fragments, preserves section context |
| `convert_do_ocr` | true | false (for digital PDFs) | 30-50% speed improvement |
| `chunking_merge_peers` | true | true | Already correct |
| `convert_do_table_structure` | true | true (only if tables exist) | Skip for text-only docs |
| `convert_include_images` | true | true | Keep — works for embedded images |
| `convert_image_export_mode` | embedded | embedded | Keep |

### Docker Images

| Image | Size | Platform | Use Case |
|-------|------|----------|----------|
| `docling-serve-cpu` | ~2 GB | amd64, arm64 | Dev machines, no GPU |
| `docling-serve-cu128` | ~11.4 GB | amd64 only | NVIDIA GPU (CUDA 12.8) |
| `docling-serve-cu130` | ~11 GB | amd64, arm64 | NVIDIA GPU (CUDA 13.0) |
