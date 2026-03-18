# Chess Tutor Demo — PDF Source Evaluation

These PDFs were evaluated for suitability as knowledge sources for the Chess Tutor fine-tuning demo. The top 3 are included in this folder.

## Top 3 (Included)

| # | File | Pages | Size | Content Type | Extraction Quality |
|---|------|-------|------|-------------|-------------------|
| 1 | `Chess-Strategy-Lasker-Indian.pdf` | 282 | 1.2MB | Dense strategy prose — openings, middlegame, endgames, pawn structures, combinations | Best: single-column, clean text, great chapter headings. Public domain (1915). |
| 2 | `chess-tactics-and-combinations-dave-regis-646.pdf` | 84 | 341K | Tactical patterns — forks, pins, skewers, discovered attacks, combinations | Good: prose sections extract well. Some OCR artifacts from ASCII chess diagrams. Tested: 0.987 avg eval score. |
| 3 | `02.-Learn-and-Master-Progressive-Chess-author-Matej-Guid.pdf` | ~55 | 5.6MB | Progressive chess variant — rules, strategy, examples | OK: adds topic variety. Heavier on diagrams. |

## Evaluated but Not Included

| File | Pages | Verdict | Reason |
|------|-------|---------|--------|
| `chess-workbook-various-authors-645.pdf` | ~50 | Bad | Fill-in-blank exercises, Russian form placeholders — not tutoring content |
| `Fundamental-Chess-Strategy-NIC.pdf` | 35 | Skip | Only a sample chapter (copyrighted 2020, Thinkers Publishing) |
| `TacticsCourse-Exeter.pdf` | 84 | Duplicate | Same Dave Regis book as #2 above |

## Selection Criteria

1. **Prose density** — text-heavy explanations extract better than diagram-heavy pages
2. **Chapter structure** — clear headings produce better topic hierarchies and extraction paths
3. **Layout** — single-column extracts cleanly; two-column or complex layouts cause Docling issues
4. **Copyright** — public domain or freely available preferred for demo
5. **Topic diversity** — covers different aspects of chess (strategy, tactics, endgames, openings)

## Known Extraction Issues

- **ASCII chess diagrams** (`!""""""""#` patterns) — Docling OCR produces garbage from text-based board diagrams. The consolidation script drops short fragments but doesn't filter these specifically.
- **Image-based diagrams** — Docling extracts them as images (base64) which are stored but not used in text generation. Pages with mostly diagrams produce thin text parts.
- **Move notation lists** — Pages with pure algebraic notation (1.e4 e5 2.Nf3 Nc6...) produce low-quality parts. Best handled by the extraction script filtering these out.

## Recommended Combination for Demo

**Option A (best quality, slower extraction):** Lasker book only — 282 pages covers the full chess curriculum.

**Option B (fastest, already tested):** Dave Regis tactics + Progressive Chess — smaller files, faster Docling processing, already produced 70 records with 0.987 avg eval in v1 test.
