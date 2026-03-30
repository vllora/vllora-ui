# Document Extraction Guide

Extract structured knowledge parts from PDFs using **pymupdf4llm** (primary) or **Docling** (fallback for scanned/complex layouts).

**Your deliverable is a `knowledge_parts.json` per document** — a typed, linked parts file matching the schema in Section 4. Every text passage and table becomes a `source_part` with a title, section metadata, and content. These get uploaded to the gateway and used by both `generate_records.py` and the NeMo `rag-retrieval` column.

---

## Section 1: Overview — Two-Stage Extraction

```
PDF
 │
 ▼  Stage 1: convert_pdf_to_markdown.py (pymupdf4llm)
 │
 ├─→ {doc-slug}.md   (inline tables, headers, text — no Docker needed)
 │
 ▼  Stage 2: extract.py (langchain text splitters)
 │
 ├─→ Level 3: MarkdownHeaderTextSplitter (split on ## / ### headers)
 │             ↓
 │           RecursiveCharacterTextSplitter.from_tiktoken_encoder
 │           (size-limit: 2000 tokens, 500 overlap)
 │
 └─→ knowledge_parts.json + parts-index.json
```

**Why this approach:**

| Property | pymupdf4llm + langchain | Docling (old primary) |
|----------|------------------------|----------------------|
| Docker required | No — pure Python pip install | Yes — 2 GB container |
| Table handling | Inline markdown tables | Structured JSON cells |
| Image handling | Inline or separate files | Base64 embedded |
| Splitting control | Full — you control chunk size/overlap | Limited — Docling's chunker |
| Best for | Digital PDFs, structured docs | Scanned PDFs, complex multi-column |

**Text splitting levels** (from best to simplest):

| Level | Method | When to use |
|-------|--------|------------|
| 3 (default) | `MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter` | Documents with `##`/`###` headers |
| 2 (fallback) | `RecursiveCharacterTextSplitter` only | Flat docs with no markdown headers |
| Docling | `build_knowledge_parts.py` on `docling-result.json` | Scanned PDFs, complex layouts |

---

## Section 2: Stage 1 — PDF → Markdown

### Prerequisites

```bash
# Check pymupdf4llm is available via uv
uv run --with pymupdf4llm python -c "import pymupdf4llm; print('OK')"
```

No Docker required. pymupdf4llm installs as a pure Python package.

### Convert

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/convert_pdf_to_markdown.py \
  "path/to/document.pdf" \
  "finetune-project/knowledge/doc-slug/doc-slug.md"
```

The script outputs standard Markdown with:
- `##` / `###` headers preserved from the PDF's structure
- Tables rendered as `| col | col |` markdown tables
- Inline text, lists, and code blocks

**Flags:**

| Flag | Default | When to use |
|------|---------|-------------|
| `--force-ocr` | off | Scanned PDF (no selectable text) |
| `--disable-ocr` | off | Speed up digital PDFs when OCR is slow |
| `--keep-header` | off | If page headers contain useful content |
| `--keep-footer` | off | If footers contain useful content (e.g., footnotes) |
| `--embed-images` | off | Include base64 images in the markdown |
| `--write-images` | off | Save images to a separate directory |

**Spot-check the output:**
```bash
head -100 finetune-project/knowledge/doc-slug/doc-slug.md
grep -c "^##" finetune-project/knowledge/doc-slug/doc-slug.md  # count top-level sections
```

If the markdown is garbled (OCR artifacts, mostly symbols) → see Section 5 (Docling fallback).

---

## Section 3: Stage 2 — Markdown → knowledge_parts.json

The `knowledge-extractor` subagent writes a per-document `extract.py`. Start from this template and adapt it:

```python
"""
Extract <DOC_SLUG> markdown into knowledge parts.

Two-stage approach:
1. MarkdownHeaderTextSplitter — splits on ## / ### headers, carries section metadata
2. RecursiveCharacterTextSplitter.from_tiktoken_encoder — size-limits large sections
   at 2000 tokens with 500 overlap (text-embedding-3-small tokenizer)
"""
import json
import re
from pathlib import Path

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

MD_PATH = Path("doc-slug.md")        # relative to DOC_DIR
OUT_DIR = Path(".")                   # write output here
SLUG = "doc-slug"
SOURCE = "Document Name"             # human-readable source label


def clean_md(text: str) -> str:
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)           # strip image refs
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)                # collapse blank lines
    return text.strip()


def infer_title(doc) -> str:
    meta = doc.metadata
    title = meta.get("subsection") or meta.get("section") or ""
    if title:
        return re.sub(r"\*+", "", title).strip()
    for line in doc.page_content.splitlines():
        line = re.sub(r"^#+\s*", "", line.strip())
        line = re.sub(r"\*+", "", line).strip()
        if len(line) > 10:
            return line[:100]
    return SOURCE


def main():
    md_text = clean_md(MD_PATH.read_text(encoding="utf-8"))

    # Stage 1 — split by headers (preserves document hierarchy)
    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("##", "section"), ("###", "subsection")],
        strip_headers=False,
    )
    header_docs = header_splitter.split_text(md_text)

    # Stage 2 — enforce token limit
    char_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        model_name="text-embedding-3-small",
        chunk_size=2000,
        chunk_overlap=500,
    )
    final_docs = char_splitter.split_documents(header_docs)

    parts = []
    for idx, doc in enumerate(final_docs, start=1):
        text = doc.page_content.strip()
        if len(text) < 80:
            continue
        # Detect table parts — chunks that are predominantly pipe-delimited rows
        part_type = "table" if text.count("|") > 10 and text.count("\n") > 3 else "text"
        parts.append({
            "id": f"{SLUG}-{idx:03d}",
            "title": infer_title(doc),
            "content": text,
            "source": SOURCE,
            "section": doc.metadata.get("section", ""),
            "subsection": doc.metadata.get("subsection", ""),
            "type": part_type,
        })

    # Renumber after filtering
    for i, p in enumerate(parts, start=1):
        p["id"] = f"{SLUG}-{i:03d}"

    knowledge_parts = {"parts": parts, "source": SOURCE, "document": SOURCE}
    (OUT_DIR / "knowledge_parts.json").write_text(json.dumps(knowledge_parts, indent=2))

    index = {
        "parts": [
            {"id": p["id"], "title": p["title"], "source": p["source"], "section": p["section"]}
            for p in parts
        ]
    }
    (OUT_DIR / "parts-index.json").write_text(json.dumps(index, indent=2))

    print(f"Extracted {len(parts)} parts")
    for p in parts[:5]:
        print(f"  [{p['id']}] {p['title'][:70]}  ({len(p['content'])} chars)")


if __name__ == "__main__":
    main()
```

**Run it:**
```bash
cd finetune-project/knowledge/doc-slug
uv run --with langchain-text-splitters --with tiktoken python extract.py
```

### Adaptation rules

**Document has no `##` headers** (flat structure — use Level 2 only):
```python
# Remove header_splitter entirely; split directly on text
char_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="text-embedding-3-small",
    chunk_size=1500,
    chunk_overlap=300,
)
final_docs = char_splitter.create_documents([md_text])
```

**Document is heavily table-based** (financial statements, spec sheets):
- Reduce `chunk_size` to 1000 so tables don't get split mid-row
- Use `"###"` as the only header level to keep table context together

**Custom instructions from user** (e.g., "split appendix fee items individually", "skip signature pages"):
- Filter out sections before splitting: `md_text = re.sub(r"## Appendix.*", "", md_text, flags=re.DOTALL)`
- Or post-filter parts by section: `[p for p in parts if "signature" not in p["section"].lower()]`

---

## Section 4: knowledge_parts.json Schema

```json
{
  "parts": [
    {
      "id": "doc-slug-001",
      "title": "Section title (inferred from heading or first line)",
      "content": "The actual text content of this chunk...",
      "source": "Human-readable document name",
      "section": "Top-level ## heading text",
      "subsection": "### sub-heading text (or empty string)",
      "type": "text | table | image"
    }
  ],
  "source": "same as parts[*].source",
  "document": "same as source"
}
```

**Required fields:** `id`, `title`, `content`, `source`, `type`
**Recommended:** `section`, `subsection` (enable topic-level filtering)

**ID format:** `{doc-slug}-{NNN}` — prefix with document slug to keep unique across multi-document workflows.

**Content guidelines:**
- Target 200–2000 chars per part (after consolidation)
- Parts under 80 chars → drop (too short to be useful)
- Parts over 4000 chars → split further (too long for embedding)
- Tables: keep column headers + rows together in one part; set `"type": "table"`

---

## Section 5: Fallback — Docling (scanned/complex PDFs)

Use Docling when:
- pymupdf4llm produces garbled text (scanned-only PDF, bad OCR)
- The document has dense multi-column layout that confuses line ordering
- You need rich structured table extraction (nested headers, merged cells)

**Requires Docker:**
```bash
# Start Docling Serve
docker run -p 5001:5001 ghcr.io/docling-project/docling-serve-cpu:latest

# Verify
curl -sS http://127.0.0.1:5001/health
```

**Extract:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/docling_extract.py \
  "path/to/document.pdf" \
  --output "finetune-project/knowledge/doc-slug/docling-result.json"
```

**Build parts from Docling output:**
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/build_knowledge_parts.py \
  "finetune-project/knowledge/doc-slug/docling-result.json" \
  -o "finetune-project/knowledge/doc-slug/knowledge_parts.json" \
  --slug "doc-slug"

# Upgrade table parts with cell structure
uv run ${CLAUDE_SKILL_DIR}/scripts/extract_tables.py \
  --docling-result "finetune-project/knowledge/doc-slug/docling-result.json" \
  --parts-file "finetune-project/knowledge/doc-slug/knowledge_parts.json"
```

---

## Section 6: Post-processing and Validation

**Consolidate** (always run after any extraction path):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/consolidate_parts.py \
  "finetune-project/knowledge/doc-slug/knowledge_parts.json"
```

Merges adjacent short parts, drops noise fragments, fixes Unicode.

**Validate** (after processing all documents):
```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/validate_extraction.py \
  finetune-project/knowledge/
```

Checks: parts-per-page ratio, title diversity, average content length, ID uniqueness.

**Merge indexes** (after all per-document extraction):
```bash
python3 -c "
import json, glob
parts = []
for f in sorted(glob.glob('finetune-project/knowledge/*/parts-index.json')):
    with open(f) as fh:
        data = json.load(fh)
        parts.extend(data.get('parts', data) if isinstance(data, dict) else data)
with open('finetune-project/knowledge/all-parts-index.json', 'w') as fh:
    json.dump({'parts': parts}, fh, indent=2)
print(f'Merged {len(parts)} parts from {len(glob.glob(\"finetune-project/knowledge/*/parts-index.json\"))} documents')
"
```

---

## Section 7: Multi-Document Workflow

Each document gets its own subdirectory under `knowledge/` named by slugifying the filename:

```
finetune-project/knowledge/
├── nist-csf-2-0/
│   ├── nist-csf-2-0.md           # pymupdf4llm output
│   ├── extract.py                 # per-doc extraction script
│   ├── knowledge_parts.json       # final parts
│   └── parts-index.json           # lightweight index
├── nist-sp-800-53/
│   └── ...
└── all-parts-index.json           # merged across all docs
```

Prefix all part IDs with the document slug (`nist-csf-2-0-001`, not `001`) so they stay unique across documents. The orchestrator merges `parts-index.json` files into `all-parts-index.json` after all per-document extractions complete.

The `knowledge-extractor` subagent is spawned once per document and runs in parallel. See SKILL.md Step 2 for the full multi-document orchestration.
