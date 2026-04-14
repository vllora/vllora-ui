# Extraction Flow — Stability Review & Recommended Approach

**Date**: 2026-03-31 (original), 2026-04 (post-ODL migration banner)
**Author**: Claude (research + codebase analysis)
**Status**: P0 + P1 implemented (2026-03-31). ODL migration addressed several P2/P3 risks (see banner below).

> **2026-04 migration banner.** Since this document was written, the primary PDF extractor changed from Docling Serve to OpenDataLoader (ODL) via a new `extract_router.py`. Several risks flagged below are now resolved or scoped smaller:
>
> - **"Docling Service Availability (CRITICAL)"** → Docker is only required when a scanned PDF is routed. All-digital corpora never touch Docling.
> - **"Docling Polling Timeouts (HIGH)"** → Not on the digital-PDF path at all (ODL is synchronous, local, JVM-based).
> - **"Docling Result Size & Agent Context (MEDIUM)"** → ODL output is smaller (no full-page PNGs by default), and `build_knowledge_parts.py` now owns all chunking — no agent-written custom scripts per doc.
> - **"Non-deterministic custom scripts"** → `build_knowledge_parts.py` sniffs the input shape (ODL `kids[]` vs Docling `chunks[]`) and emits byte-identical output across reruns for the same input.
>
> Risks tied to Docling are now only active on the scanned-PDF fallback path. The document is preserved as a historical record of what the migration was meant to fix — do not delete.

---

## Executive Summary

**(Pre-migration, 2026-03-31.)** The current PDF extraction flow (Step 2) is the **most fragile step in the pipeline**. It depends on a Docker service (Docling Serve) that may or may not be running, spawns parallel subagents that can silently fail, produces non-deterministic output due to agent-written custom scripts, and has quality gates that don't block progression. This document maps the full flow, identifies every instability point, and proposes a hardened architecture based on industry research.

---

## Current Extraction Flow — Full Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: EXTRACT DOCUMENTS                       │
│                                                                         │
│  Input: PDF files listed by user in Step 1                              │
│  Output: knowledge_parts.json per document + all-parts-index.json       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │  2a. Check Docling health     │
                    │  curl localhost:5001/health    │
                    └──────────┬───────────────────┘
                               │
                     ┌─────────┴──────────┐
                     │                    │
              DOCLING_OK          DOCLING_UNAVAILABLE
                     │                    │
                     ▼                    ▼
        ┌──────────────────┐   ┌───────────────────────┐
        │ docling_extract.py│   │ pdftotext_extract.py   │
        │ --submit-only     │   │ (per document)         │
        │ (all PDFs at once)│   │ TEXT ONLY — no tables,  │
        └────────┬─────────┘   │ no images, no layout    │
                 │              └───────────┬─────────────┘
                 │                          │
                 ▼                          │
        ┌──────────────────┐               │
        │ Returns manifest: │               │
        │ [{task_id, pdf,   │               │
        │   output, status}]│               │
        └────────┬─────────┘               │
                 │                          │
                 ▼                          │
┌─────────────────────────────────────────────────────────────────────┐
│  2b. Spawn knowledge-extractor subagents (1 per document, ≤ 5)     │
│                                                                     │
│  Each agent receives:                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ SKILL_DIR, WORKFLOW_ID, GATEWAY_URL                         │    │
│  │ DOC_PATH (PDF), DOC_SLUG, DOC_DIR, TASK_ID (from manifest) │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Each agent does (sequentially):                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 1. Poll Docling until task completes (or use pdftotext result)│   │
│  │    └─ docling_extract.py --poll-one $TASK_ID --output $OUT   │   │
│  │                                                               │   │
│  │ 2. Agent reads docling-result.json (chunks + document tree)  │   │
│  │    ⚠ THIS IS THE FRAGILE PART — agent writes custom Python   │   │
│  │    ⚠ extract.py per document based on what it sees           │   │
│  │                                                               │   │
│  │ 3. Agent-written extract.py transforms Docling output to:    │   │
│  │    └─ knowledge_parts.json (structured parts)                │   │
│  │    └─ parts-index.json (lightweight index)                   │   │
│  │                                                               │   │
│  │ 4. consolidate_parts.py — merges, filters, fixes Unicode     │   │
│  │                                                               │   │
│  │ 5. Upload to gateway:                                        │   │
│  │    └─ finetune.py upload-knowledge --parts-file ...          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Agents run in PARALLEL (up to 4-5 at once)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │  2c. Merge all indexes        │
                    │  (after ALL agents return)    │
                    │                               │
                    │  glob */parts-index.json      │
                    │  → all-parts-index.json       │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  2d. validate_extraction.py   │
                    │                               │
                    │  Checks per document:         │
                    │  □ Parts count > 0            │
                    │  □ Parts/page 1–15            │
                    │  □ <20% short parts (<50ch)   │
                    │  □ Title diversity > 50%      │
                    │  □ Avg content > 100 chars    │
                    │  □ No Unicode escapes         │
                    │  □ ≥3 unique extraction paths │
                    │                               │
                    │  Produces: PASS / WARN / FAIL │
                    │  ⚠ Does NOT block pipeline!   │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  2e. Review with user         │
                    │  (section count, sample       │
                    │   titles, quality summary)    │
                    └──────────────────────────────┘
                               │
                               ▼
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         Step 3:          Step 4:          Gateway DB
         Topic            Data             (parts already
         Design           Generation        uploaded)
```

---

## Data Structures Produced

### knowledge_parts.json (per document)

```json
{
  "source": {
    "id": "chess-tactics-pdf",
    "workflow_id": "wf_abc123",
    "name": "chess-tactics.pdf",
    "description": "Source: chess-tactics.pdf",
    "metadata": { "total_pages": 84, "extraction_method": "docling_hybrid" }
  },
  "parts": [
    {
      "id": "chess-tactics-chapter-3-forks",
      "reference_id": null,
      "source_id": "chess-tactics-pdf",
      "type": "text",
      "content": "Chapter 3: Forks\n\nA fork attacks two or more pieces simultaneously...",
      "title": "Chapter 3: Forks",
      "extraction_path": "[\"Chess Tactics\", \"Tactical Motifs\", \"Forks\"]",
      "content_metadata": {},
      "extraction_metadata": {
        "pages": [42, 43],
        "source_chunks": [20, 21, 22],
        "doc_item": "#/texts/115"
      }
    }
  ]
}
```

### parts-index.json (lightweight, per document)

Same structure but `content` is truncated to ~200 chars (preview only). Used by Step 3 topic design to understand available content without loading full text.

### all-parts-index.json (merged, all documents)

Concatenation of all per-document indexes. Single file consumed by topic design and relation building.

---

## Identified Instability Points

### 1. Docling Service Availability (CRITICAL)

**Problem**: The entire extraction hinges on whether a Docker container is running on `localhost:5001`. No Docker = fall back to `pdftotext` which produces text-only output (no tables, no images, no structure).

**Why this causes flaky runs**:
- Docling container may crash silently (OOM on large PDFs)
- Container may not start on machines without Docker (Apple Silicon CI, cloud VMs)
- Health check is a single point-in-time check — container can die mid-extraction

**Current mitigation**: Binary fallback to `pdftotext_extract.py` (text-only, loses 60%+ of extraction quality).

### 2. Agent-Written Custom Extract Scripts (CRITICAL)

**Problem**: In step 2b, each subagent **writes a custom Python script** to transform Docling output into `knowledge_parts.json`. This is the LLM *generating code on the fly* for each document. The script differs every run because:
- The LLM sees different context each time
- Docling output varies slightly between runs (chunk boundaries, heading detection)
- The agent makes different decisions about what constitutes a "heading" vs "noise"

**Why this causes flaky runs**: The same PDF produces different knowledge_parts.json each time. Different part boundaries → different topic-part relations → different training records → different eval scores. **The extraction is non-deterministic by design.**

**Current mitigation**: `consolidate_parts.py` normalizes some variation, but can't fix fundamentally different extraction decisions.

### 3. Parallel Subagent Coordination (HIGH)

**Problem**: 4-5 agents run simultaneously. If one crashes:
- No auto-retry mechanism
- No "at least N of M must succeed" logic
- The merge step (2c) runs after ALL agents return — but "return" includes returning with errors
- A missing `parts-index.json` from a crashed agent is silently skipped in the merge

**Why this causes flaky runs**: A single agent failure means a document is missing from the pipeline, but downstream steps don't know this and continue with incomplete data.

### 4. Docling Polling Timeouts (HIGH)

**Problem**: `poll_until_done()` has a 1800s (30 min) timeout. For large PDFs (300+ pages), this can be insufficient, especially on CPU-only Docker.

**Why this causes flaky runs**: A PDF that works on a fast machine may timeout on a slower one. The failure mode is a hard crash (`sys.exit(1)`), not a graceful degradation.

### 5. Quality Gate Non-Enforcement (MEDIUM)

**Problem**: `validate_extraction.py` produces PASS/WARN/FAIL but **does not block the pipeline**. The SKILL.md shows it running as a check, but the pipeline continues regardless.

**Why this causes flaky runs**: Bad extractions poison downstream steps. Low title diversity → bad topic design. Short fragments → noisy training data. These failures show up as poor eval scores, not as extraction errors.

### 6. Docling Result Size & Agent Context (MEDIUM)

**Problem**: A 100-page PDF produces a 30-50MB Docling result. The agent must read this to write the extraction script. If the result exceeds the agent's context window, the agent produces incomplete or broken scripts.

**Why this causes flaky runs**: Works for small PDFs, fails for large ones. The failure mode is subtle — the extraction script runs but produces incomplete output.

### 7. Heading Detection Noise (MEDIUM)

**Problem**: Docling marks many things as `section_header` that aren't headings (chess moves, page numbers, running headers, table cells). The agent-written script must filter these, but filtering logic varies per run.

**Why this causes flaky runs**: Different heading detection → different part boundaries → different extraction_paths → different topic design.

### 8. pdftotext Binary Dependency (LOW)

**Problem**: `is_digital_pdf()` calls `pdftotext` binary. If not installed (no `poppler`), it returns `False` (assumes scanned), causing unnecessary OCR on digital PDFs.

**Why this causes flaky runs**: OCR on digital PDFs is slower and can produce garbled output for specialty fonts.

---

## Industry Research: How Other Platforms Handle PDF Extraction

### The Core Insight

**Document-type variance dwarfs parser variance.** The Applied AI benchmark (800+ documents, 17 parsers, 7 frontier LLMs) shows accuracy varies by 55+ percentage points by document type. The choice of parser matters less than understanding your document type and having a robust pipeline around it.

**No major fine-tuning platform accepts PDFs directly.** Every commercial platform (OpenAI, Together AI, Fireworks, Cohere, Predibase) requires pre-processed JSONL. Document-to-training-data is universally treated as a separate preprocessing step. Our finetune skill is one of very few end-to-end pipelines that go from PDF → graded JSONL training data in a single workflow.

---

### How AI Platforms Handle PDFs (API / Inference)

#### OpenAI

- **File Search / Assistants API**: Automatically parses, chunks (800-token chunks, 400-token overlap), embeds, and stores PDFs in a vector database. Internal parser is a **black box** — not publicly disclosed.
- **Vision models (GPT-4o, GPT-4.1)**: Extracts both text content AND page images from PDFs, sending both to the model simultaneously (dual modality).
- **Fine-tuning (SFT + RFT)**: JSONL only. **No PDF support whatsoever.** Users must extract and structure data themselves. The RFT guide has zero mention of document processing.
- **Known issues**: Community reports inconsistent extraction quality, especially for complex tables and multi-column layouts.

#### Anthropic / Claude

- **Dual-modality pipeline**: Each page is (1) rasterized into an image and (2) has text extracted. Both are interleaved in page order.
- **Limits**: Max 32 MB, 600 pages. Each page costs ~1,500–3,000 text tokens + image tokens.
- **Key gotcha on Bedrock**: Must enable citations to get full visual PDF analysis — without it, silently falls back to basic text extraction only.
- **Accuracy**: June 2025 benchmark found Claude was the only model with **zero hallucinated citations** across 115 queries on legal/scientific/literary PDFs.
- **Fine-tuning**: No native PDF-to-training-data support.

#### Google / Gemini

- **Native multimodal**: Each page processed as image (up to 3072×3072px). Fixed cost: **258 tokens per page** regardless of content.
- **Document AI Layout Parser** (enterprise): 3-stage pipeline — (1) Parse & Structure, (2) Annotate & Verbalize with Gemini, (3) Chunk & Augment.
- **NotebookLM**: Runs on Gemini 3, builds invisible knowledge graph from uploaded sources. Struggles with >30 documents.
- **Fine-tuning**: No built-in PDF processing.

---

### How Fine-Tuning Platforms Handle Document Input

| Platform | Input Format | PDF Support | Notes |
|----------|-------------|-------------|-------|
| **OpenAI SFT/RFT** | JSONL (`messages` array) | None | Provides validation CLI but not extraction |
| **Together AI** | JSONL or Parquet | None | Supports long-context fine-tuning up to 32K tokens |
| **Fireworks AI** | JSONL (`messages` array) | None | Supports `weight` key for loss masking |
| **Cohere** | JSONL or CSV | None | Min 40 examples, 100+ recommended |
| **Predibase/LoRAX** | Structured datasets | None | Declarative config, expects structured input |
| **Scale AI/Spellbook** | Structured data | None | 100-500 examples expected |
| **HuggingFace AutoTrain** | CSV, TSV, JSON, JSONL | None | Explicitly not supported per forums |
| **Axolotl** | JSONL (ShareGPT/Alpaca) | Beta multimodal only | Only for training models to *see* PDFs, not extract text |
| **LLaMA-Factory** | JSON/JSONL | None | Expects pre-processed structured data |
| **TRL (HuggingFace)** | HF Datasets format | None | Handles training only, not data prep |

**Universal pattern**: Every platform expects `{messages: [{role, content}]}` JSONL. Extraction is always the user's problem.

---

### PDF Extraction Tools — Detailed Comparison

#### Docling (IBM) — What We Currently Use

- **55k GitHub stars**, Apache 2.0, contributed to Linux Foundation
- **Two pipelines**: (1) Standard: PDF Parser → DocLayNet layout model → TableFormer → reading order. (2) VLM: Granite-Docling-258M (SigLIP 93M + Granite 165M) end-to-end.
- **Table accuracy**: 97.9% on benchmark (48 entries, 1 missed)
- **Speed**: 3.1 sec/page CPU, 1.27 sec/page M3 Max, **0.49 sec/page GPU (CUDA)**
- **Standard pipeline is deterministic** — same input always produces same output
- **Known production issues**:
  - SIGABRT crash on Python 3.12 in Databricks Serverless (even on tiny 0.4 MB PDFs)
  - 20+ minutes to process 180-page PDFs with many images
  - Requires docling-ibm-models≥2.0.7 and deepsearch-glm≥0.26.2 for stability
  - Active GitHub issue tracker with ongoing crash reports

#### MinerU (OpenDataLab) — Strongest Alternative

- **30k+ GitHub stars**, AGPL-3.0
- **Architecture**: Two-stage VLM — (1) structure analysis on downsampled images, (2) detailed recognition at original resolution. NaViT encoder (675M) + Qwen2-Instruct (0.5B) = ~1.2B total params.
- **OmniDocBench winner**: Score **90.67** (beats Gemini 2.5 Pro on benchmarks)
- **Speed**: **0.21 sec/page GPU** (fastest open-source), 2.12 pages/sec on A100
- **Strengths**: Excellent on Asian documents (perfect 1.000 on Chinese TED-Struct). Handles headers, footers, rotated layouts.
- **GPU requirements**: Min 8GB VRAM, peaks 20-25GB on complex multi-page PDFs
- **Production-ready**: Docker deployment with multi-GPU auto load balancing

#### Marker (Datalab/VikParuchuri)

- **33k GitHub stars**, modified license (free for research/personal, startups <$2M)
- Built on Surya OCR (90+ languages, 0.97 avg similarity vs Tesseract's 0.88)
- **Speed**: 16+ sec/page CPU (slowest), **0.86 sec/page GPU**
- Outputs Markdown, JSON, HTML. Multi-format support (DOCX, XLSX, EPUB, images)
- Deterministic output

#### olmOCR (Allen AI) — Best for Batch Scale

- Fine-tuned Qwen2.5-VL-7B on 270K PDF pages
- Produces Markdown (headings), HTML (tables), LaTeX (equations) directly
- **For born-digital PDFs**: Extracts text blocks with PyPDF as "anchors" to reduce VLM hallucination
- **olmOCR 2**: Uses deterministic verifiers as training signal. Score: 82.4 on olmOCR-Bench
- **Cost**: **$190 per million pages** (32× cheaper than GPT-4o)
- Open-source (Allen AI)

#### LlamaParse (LlamaIndex)

- **Four tiers**: Fast (raw text), Cost Effective (parser + LLM), Agentic (VLM screenshots), Agentic Plus (full workflow)
- **Pricing**: $0.004–$0.11 per page depending on tier
- **Known issues**: API performance degradation (seconds → minutes), complex tables misalign columns, skips content in dense financial reports
- **Not deterministic** for Agentic tiers
- Processing: ~53.68 sec on benchmark documents

#### Unstructured.io

- **Four strategies**: fast (PDFMiner text), hi_res (Detectron2 layout), ocr_only (Tesseract), auto (adaptive)
- Simple tables: 100% accuracy. Complex tables: only **75%** cell accuracy
- Table of contents: **Failed** — captured only header with empty structure
- Text extraction: Introduces extraneous content beyond source material
- Speed: 4.2 sec/page CPU

#### Reducto

- **Hybrid 3-stage**: CV segmentation → VLM interpretation → Agentic OCR (multi-pass review loop)
- ~0.90 similarity on RD-TableBench (outperforms AWS/Google/Azure by ~20pts)
- **Pricing**: $0.015+/page. $24.5M Series A.
- CV stage is deterministic; VLM stages are not

---

### Speed / Accuracy / Cost Comparison Table

| Tool | Speed (CPU) | Speed (GPU) | Table Accuracy | Cost | Deterministic |
|------|------------|-------------|---------------|------|--------------|
| **PyMuPDF4LLM** | Milliseconds | N/A | Low (text only) | Free | Yes |
| **Docling** | 3.1 s/page | 0.49 s/page | 97.9% | Free | Standard: Yes |
| **MinerU 2.5** | 3.3 s/page | **0.21 s/page** | **90.67 OmniDocBench** | Free | Mostly |
| **Marker** | 16+ s/page | 0.86 s/page | Good | Free* | Yes |
| **Unstructured** | 4.2 s/page | N/A | 75% complex | Free/Paid | hi_res: Mostly |
| **olmOCR** | N/A | ~0.5 s/page | 82.4 olmBench | Free ($190/1M hosted) | Mostly |
| **LlamaParse** | Cloud only | Cloud only | Data ok, alignment poor | $0.004–0.11/page | No |
| **Reducto** | Cloud only | Cloud only | ~0.90 RD-TableBench | $0.015+/page | Partially |
| **Claude** | Cloud only | Cloud only | High (0 hallucinated citations) | ~$0.004–0.007/page | No |
| **Gemini Flash** | Cloud only | Cloud only | Good | **~$0.0005/page** | No |
| **GPT-4o** | Cloud only | Cloud only | Good | ~$0.012/page | No |

---

### Enterprise Approaches (Dropbox, NVIDIA, Notion)

**NVIDIA NeMo Retriever** built a full comparison:
- OCR pipeline: **8.47 pages/sec**, 0.118s latency/page
- VLM pipeline (Llama 3.2 11B): **0.26 pages/sec** — 32.3× slower
- OCR pipeline won by 7.2% retrieval recall on 10K documents
- VLM failures: incorrect chart interpretation, hallucinated details, incomplete table extraction
- **Production recommendation**: "OCR pipeline for retrieval, VLM for visual QA"

**Dropbox**: Uses Nutrient (formerly PSPDFKit) for PDF processing since 2011, chaining 30+ operations in single API calls. 800B+ content items.

**Key enterprise takeaway**: Large companies overwhelmingly use **specialized, staged pipelines** (not raw VLM passes) for production document processing.

---

### End-to-End Document-to-Training-Data Pipelines (Our Competitors)

These tools bridge the same gap our finetune skill fills:

| Tool | Stars | Pipeline | PDF Support | Training | Eval Loop |
|------|-------|----------|-------------|----------|-----------|
| **Easy Dataset** | 9k+ | Upload → chunk → LLM Q&A → review → JSONL | Via configurable extractors | Export only | None |
| **Augmentoolkit** | - | Text → LLM Q&A + hallucination checks → JSONL | Text only | Auto-finetune option (~$20) | None |
| **DataFlow** (OpenDCAI) | - | Ingest → operators → generate → evaluate → filter | PDF2QA pipeline | Export + training | Filtering step |
| **doc2dataset** | - | 30+ formats → macro-cells → HF/Axolotl/OpenAI JSONL | Rust-based, fast | Export only | None |
| **IBM Data Prep Kit** | - | Docling extraction → Ray/Spark → chunking → embedding | Via Docling | Export only | None |
| **vLLora Skill** | - | Extract → topics → generate → grade → eval → GRPO | Docling/pdftotext | Integrated GRPO | **Iterative eval-first + readiness gate** |

**What we do that nobody else does**:
1. Grader-evaluated training loop (eval iterations before training)
2. GRPO with document-sourced data (others target SFT only)
3. Topic hierarchy as organizing principle (others use flat chunks)
4. Skill-as-interface via Claude Code (novel interaction model)

**What others do better (areas to watch)**:
1. Easy Dataset's GUI for human-in-the-loop review of intermediate outputs (9K+ stars = demand)
2. DataFlow's operator composability (DAG-based, more modular than our monolithic steps)
3. doc2dataset's 30+ format coverage
4. Augmentoolkit's hallucination checking on generated Q&A pairs

---

### The Vision-First Approach — Should We Switch?

**Who uses page-to-image + VLM as PRIMARY extraction?**
- OpenAI (GPT-4o): text + page images together
- Anthropic (Claude): rasterized pages + extracted text interleaved
- Google (Gemini): native multimodal, 258 tokens/page
- LlamaParse Agentic tier: page screenshots → VLM
- MinerU 2.5: two-stage VLM (structure on downsampled, detail on original)

**Cost at scale (10,000 pages)**:
| Approach | Cost | Deterministic? |
|----------|------|----------------|
| Docling (self-hosted) | $0 | Yes |
| MinerU (self-hosted) | $0 | Mostly |
| olmOCR (self-hosted) | ~$1.90 | Mostly |
| Gemini Flash 2.0 | ~$5 | No |
| Claude Sonnet | ~$35-70 | No |
| GPT-4o | ~$125 | No |
| LlamaParse (agentic) | ~$1,125 | No |

**Practitioner consensus (HN/Reddit 2025-2026)**:
- A fintech company replaced legacy OCR with Gemini: 12 min → 6 sec, 96% vendor accuracy
- Financial services pushback: "Our customers would not accept 96%... maybe 99.96%"
- Vision-only sometimes outperforms hybrid because "poor-quality PDF text extraction just confused the LLM"
- **Key hallucination risk**: LLMs can "rewrite full sentences" with plausible fabrications, unlike traditional OCR's character-level errors

**Our recommendation**: **Do NOT switch to vision-first.** For fine-tuning data generation where accuracy is paramount, a hybrid approach (deterministic extraction + VLM only for visual elements) is the production consensus. Vision-first is simpler but non-deterministic and can hallucinate — unacceptable for training data.

---

### The Consensus Architecture (2025-2026)

```
PDF Input
    │
    ├── Deterministic extraction (Docling/MinerU/Marker)
    │   └── Produces: structured chunks, tables, images, headings
    │
    ├── Deterministic post-processing (code, not LLM)
    │   └── Merging, filtering, quality gates
    │
    └── LLM enrichment (optional, only for failed pages)
        └── Vision model re-extracts pages that fail quality checks
```

**The key principle**: The LLM should NEVER decide document structure. Structure comes from deterministic parsing. The LLM's job is enrichment and interpretation *after* structure is established.

---

## Implemented: Deterministic Extraction Pipeline

### Architecture Change (DONE — 2026-03-31)

Replaced the "agent writes custom extract.py per document" approach with a **single deterministic script** (`build_knowledge_parts.py`) that handles all documents the same way. Updated in `SKILL.md` Step 2 and `agents/knowledge-extractor.md`.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CURRENT: STEP 2 (HARDENED)                           │
└─────────────────────────────────────────────────────────────────────────┘

PDF files
    │
    ▼
┌─────────────────────────────────────────────┐
│ 2a. Check Docling → submit all PDFs         │
│     (unchanged)                              │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2b. Per-document (parallel, ≤ 5):           │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 1. Poll Docling / use pdftotext result │  │
│  │                                        │  │
│  │ 2. build_knowledge_parts.py            │  │  ◄── DETERMINISTIC
│  │    (FIXED script, not agent-written)   │  │      Same input = same output
│  │    Handles: text, tables, images       │  │
│  │    Merges small chunks automatically   │  │
│  │    Filters noise headings              │  │
│  │                                        │  │
│  │ 3. consolidate_parts.py (unchanged)    │  │
│  │                                        │  │
│  │ 4. validate_extraction.py              │  │
│  │    ⚠ NOW BLOCKS on FAIL               │  │  ◄── ENFORCED GATE
│  │    FAIL → retry with --fix             │  │
│  │    FAIL again → flag for user review   │  │
│  │                                        │  │
│  │ 5. Upload to gateway (unchanged)       │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  On agent crash: auto-retry once, then skip  │  ◄── RETRY LOGIC
│  with explicit warning to user               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2c. Merge indexes                            │
│     + validate ALL expected docs present     │  ◄── COMPLETENESS CHECK
│     + warn if any docs missing               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2d. Overall validation (unchanged)           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2e. Vision LLM fallback (NEW, optional)      │
│                                              │
│  For pages that failed quality checks:       │
│  - Render page as image (PyMuPDF)            │
│  - Send to Claude/GPT-4V with extraction     │
│    prompt                                    │
│  - Merge LLM-extracted content into parts    │
│                                              │
│  Only triggered if:                          │
│  - validate_extraction reports FAIL          │
│  - Specific pages identified as low-quality  │
│  - User hasn't opted out of LLM extraction   │
└─────────────────────────────────────────────┘
```

### What Was Changed (P0 + P1)

#### Change 1: `build_knowledge_parts.py` is now the default ✅ DONE

**Files changed**: `finetune-skill/SKILL.md` (Step 2), `agents/knowledge-extractor.md` (Step 3)

- Subagents now MUST use `build_knowledge_parts.py` as the first extraction method
- Custom `extract.py` only allowed when: (a) deterministic script produces 0 parts, or (b) user provides explicit CUSTOM_INSTRUCTIONS
- Agent report now includes `Extraction script:` field showing which path was taken
- Extraction metadata changed from `docling_hybrid` → `docling_deterministic`

**Old flow** (fragile):
```
Agent reads docling-result.json → Agent writes custom extract.py → Agent runs extract.py
```

**New flow** (deterministic):
```
build_knowledge_parts.py reads docling-result.json → outputs knowledge_parts.json
```

#### Change 2: Quality gates now block the pipeline ✅ DONE

**Files changed**: `finetune-skill/SKILL.md` (Step 2d), `agents/knowledge-extractor.md` (Step 5)

- Step 2d now runs `validate_extraction.py --fix` (auto-fix first)
- FAIL after `--fix` blocks the pipeline — must re-consolidate or escalate to user
- Subagents run per-document validation before upload and report PASS/WARN/FAIL
- Explicit instruction: "Do NOT silently proceed to Step 3 with FAIL status"

#### Change 3: Completeness check at merge ✅ DONE

**Files changed**: `finetune-skill/SKILL.md` (Step 2c)

- Merge script now compares `expected_slugs` vs `found_slugs`
- Missing documents trigger WARNING + `sys.exit(1)` to block pipeline
- Explicit "ACTION REQUIRED" message for missing documents

#### Change 4: Retry logic for subagent failures ✅ DONE

**Files changed**: `finetune-skill/SKILL.md` (Step 2b)

- On failure: check if `docling-result.json` exists → re-run script or re-submit to Docling
- Second failure → warn user explicitly, continue with remaining documents
- "Do NOT silently skip failed documents"

### Remaining Changes (P2 + P3 — Not Yet Implemented)

#### Change 5: Vision LLM fallback for failed pages (P2)

For pages that produce low-quality extraction (detected by validation), offer a vision LLM re-extraction:

```python
# Render failed pages as images
import fitz
doc = fitz.open("document.pdf")
for page_num in failed_pages:
    page = doc[page_num]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    pix.save(f"page_{page_num:03d}.png")

# Send to Claude/GPT-4V for structured extraction
# Cost: ~$0.01-0.03 per page
```

This is a **fallback**, not the primary path. Most documents should extract cleanly with `build_knowledge_parts.py`.

#### Change 6: Evaluate MinerU as Docling alternative (P3)

MinerU 2.5 scores 90.67 on OmniDocBench (SOTA) and runs at 0.21 sec/page on GPU. Worth evaluating as a replacement or complement to Docling, especially for complex documents. Requires GPU (min 8GB VRAM) and has AGPL-3.0 license.

---

## Priority & Implementation Status

| Change | Impact on Stability | Priority | Status |
|--------|-------------------|----------|--------|
| Use `build_knowledge_parts.py` instead of agent-written scripts | **Eliminates non-determinism** | P0 | ✅ Done (SKILL.md, knowledge-extractor.md) |
| Enforce quality gate (block on FAIL) | **Prevents poison data** | P0 | ✅ Done (SKILL.md, knowledge-extractor.md) |
| Add completeness check at merge | Catches missing documents | P1 | ✅ Done (SKILL.md Step 2c) |
| Add retry logic for subagent failures | Handles transient failures | P1 | ✅ Done (SKILL.md Step 2b) |
| Add vision LLM fallback for failed pages | Handles edge cases | P2 | Pending |
| Evaluate MinerU as Docling alternative | Higher accuracy baseline | P3 | Pending |

---

## What NOT to Change

1. **Docling Serve as primary extractor** — it's the right choice (55k stars, deterministic, good table support, local deployment). The instability is in how we use it, not in Docling itself.

2. **Parallel subagent architecture** — spawning agents per document is correct for throughput. The fix is adding retry/completeness checks, not removing parallelism.

3. **The `knowledge_parts.json` schema** — the data format is well-designed and used by all downstream steps. No schema changes needed.

4. **pdftotext as fallback** — having a zero-dependency fallback is valuable. The fix is making the primary path more reliable, not removing the fallback.

---

## Research Sources

### Benchmarks & Comparisons
| Source | Key Finding |
|--------|------------|
| [Applied AI PDF Benchmark](https://www.applied-ai.com/briefings/pdf-parsing-benchmark/) (800+ docs, 17 parsers) | Document-type variance > parser variance |
| [OmniDocBench (CVPR 2025, arXiv:2412.07626)](https://arxiv.org/abs/2412.07626) | MinerU 2.5 scores 90.67, beats 72B VLMs |
| [NVIDIA OCR vs VLM](https://developer.nvidia.com/blog/approaches-to-pdf-data-extraction-for-information-retrieval/) | OCR pipeline 32.3× faster than VLM, +7.2% recall |
| [Procycons PDF Benchmark 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/) | Docling 97.9% table accuracy, MinerU best overall |
| [NVIDIA Chunking Research](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) | Semantic chunking outperforms fixed-size by 15-20% |

### Platform Documentation
| Source | Relevance |
|--------|-----------|
| [OpenAI File Search](https://developers.openai.com/api/docs/guides/tools-file-search) | Black-box PDF parser, 800-token chunks |
| [OpenAI RFT Guide](https://platform.openai.com/docs/guides/reinforcement-fine-tuning) | JSONL only, no PDF support for fine-tuning |
| [Anthropic PDF Support](https://platform.claude.com/docs/en/docs/build-with-claude/pdf-support) | Dual-modality: rasterized + text, 0 hallucinated citations |
| [Gemini Document Processing](https://ai.google.dev/gemini-api/docs/document-processing) | 258 tokens/page, native multimodal |
| [Google Document AI Layout Parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk) | 3-stage enterprise pipeline |
| [Together AI Data Prep](https://docs.together.ai/docs/fine-tuning-data-preparation) | JSONL/Parquet only |
| [Fireworks SFT Docs](https://docs.fireworks.ai/fine-tuning/fine-tuning-models) | JSONL with weight/sample_weight |

### Tools & Libraries
| Source | Relevance |
|--------|-----------|
| [Docling GitHub](https://github.com/docling-project/docling) (55k stars) | Our current extractor; known SIGABRT issues |
| [MinerU GitHub](https://github.com/opendatalab/MinerU) (30k+ stars) | Strongest alternative; AGPL-3.0 |
| [MinerU 2.5 Paper (arXiv:2509.22186)](https://arxiv.org/html/2509.22186v2) | Two-stage VLM architecture details |
| [Marker GitHub](https://github.com/datalab-to/marker) (33k stars) | Surya OCR, 0.97 avg similarity |
| [olmOCR GitHub](https://github.com/allenai/olmocr) | $190/million pages, open-source |
| [olmOCR 2 Blog](https://allenai.org/blog/olmocr-2) | Deterministic verifiers as training signal |
| [IBM Granite-Docling](https://www.ibm.com/new/announcements/granite-docling-end-to-end-document-conversion) | 258M param end-to-end VLM |
| [LlamaParse V2](https://www.llamaindex.ai/blog/introducing-llamaparse-v2-simpler-better-cheaper) | 4 tiers, $0.004-0.11/page |
| [Unstructured Architecture](https://deepwiki.com/Unstructured-IO/unstructured) | 4 strategies, 75% complex table accuracy |
| [Reducto Hybrid Architecture](https://llms.reducto.ai/hybrid-architecture-agentic-ocr-deep-dive) | CV + VLM + Agentic OCR 3-stage |

### Document-to-Training-Data Pipelines
| Source | Relevance |
|--------|-----------|
| [Easy Dataset (arXiv:2507.04009)](https://arxiv.org/abs/2507.04009) (9k+ stars) | GUI-based doc → Q&A → JSONL, most similar to our approach |
| [Augmentoolkit GitHub](https://github.com/e-p-armstrong/augmentoolkit) | Text → instruction pairs with hallucination checks |
| [DataFlow GitHub](https://github.com/OpenDCAI/DataFlow) | Enterprise doc → training data with PDF2QA pipeline |
| [doc2dataset GitHub](https://github.com/3DCF-Labs/doc2dataset) | Rust-based, 30+ formats, NumGuard integrity |
| [IBM Data Prep Kit](https://github.com/ibm/data-prep-kit) | Docling + Ray/Spark at scale |

### Community Discussions
| Source | Key Insight |
|--------|------------|
| [HN: Gemini Changes Everything](https://news.ycombinator.com/item?id=42952605) | Fintech: 96% accuracy OK for some, not financial services |
| [HN: So You Want to Parse a PDF](https://news.ycombinator.com/item?id=44780353) | Poor PDF text extraction can confuse LLMs more than help |
| [HN: Benchmarking Document Parsing](https://news.ycombinator.com/item?id=45838365) | Real practitioner comparisons |
| [Docling SIGABRT Issue #3201](https://github.com/docling-project/docling/issues/3201) | Python 3.12 crash on Databricks |
| [Docling Large PDF Issue #2892](https://github.com/docling-project/docling/issues/2892) | 20+ min for 180-page PDFs |

---

## TL;DR

**Root cause of instability**: The agent writes custom Python extraction code for every document on every run. Same PDF → different code → different parts → different training data.

**Fix (implemented 2026-03-31)**: `build_knowledge_parts.py` is now the mandatory default. Quality gates block the pipeline on FAIL. Merge step checks for missing documents. Subagent failures trigger retry before skipping. LLM involvement is reserved for enrichment (Step 4), not structural extraction (Step 2).

**Files changed**: `finetune-skill/SKILL.md` (Step 2), `agents/knowledge-extractor.md`, `docs/.../extraction-deep-dive.md`

**Remaining**: P2 (vision LLM fallback) and P3 (MinerU evaluation) are not yet implemented.
