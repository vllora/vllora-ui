# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Fallback PDF extraction when OpenDataLoader tooling is not available.

Converts PDF → text via pdftotext, splits on markdown-style headings,
and outputs knowledge_parts.json in the same schema as the ODL-based extraction flow.
Text-only — no tables, images, or layout structure.

Single file:
    uv run scripts/pdftotext_extract.py document.pdf -o knowledge/doc-slug/knowledge_parts.json

Batch mode:
    uv run scripts/pdftotext_extract.py --batch \
      doc1.pdf:knowledge/doc1/knowledge_parts.json \
      doc2.pdf:knowledge/doc2/knowledge_parts.json

Custom heading pattern (e.g., split on # instead of ##):
    uv run scripts/pdftotext_extract.py document.pdf -o out.json --heading-pattern '^#\\s+(.+?)\\s*$'
"""

import argparse
import json
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def find_pdftotext() -> str:
    """Find pdftotext binary, checking common locations."""
    candidates = ["pdftotext", "/opt/homebrew/bin/pdftotext", "/usr/bin/pdftotext"]
    for cmd in candidates:
        try:
            subprocess.run([cmd, "-v"], capture_output=True, check=False)
            return cmd
        except FileNotFoundError:
            continue
    print(
        "ERROR: pdftotext not found. Install: brew install poppler (macOS) "
        "or apt-get install poppler-utils (Linux)",
        file=sys.stderr,
    )
    sys.exit(1)


def pdf_to_text(pdftotext_bin: str, pdf_path: Path) -> tuple[str, int]:
    """Run pdftotext and return (text, page_count)."""
    result = subprocess.run(
        [pdftotext_bin, "-layout", str(pdf_path), "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    text = result.stdout

    # Get page count via pdfinfo if available
    page_count = 0
    pdfinfo_bin = pdftotext_bin.replace("pdftotext", "pdfinfo")
    try:
        info = subprocess.run(
            [pdfinfo_bin, str(pdf_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        for line in info.stdout.splitlines():
            if line.startswith("Pages:"):
                page_count = int(line.split(":")[1].strip())
                break
    except (FileNotFoundError, subprocess.CalledProcessError):
        # Estimate from form feeds
        page_count = text.count("\f") + 1 if text else 0

    return text, page_count


def clean_text(text: str) -> str:
    """Clean pdftotext output artifacts."""
    text = re.sub(r"\f", "\n\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def split_on_headings(
    text: str,
    heading_pattern: str = r"(?m)^#{1,3}\s+(.+?)\s*$",
) -> list[dict]:
    """Split text into sections by heading pattern.

    Returns list of {heading: str|None, content: str}.
    """
    matches = list(re.finditer(heading_pattern, text))
    sections: list[dict] = []

    if not matches:
        body = text.strip()
        if body:
            sections.append({"heading": None, "content": body})
        return sections

    # Preamble before first heading
    if matches[0].start() > 0:
        preamble = text[: matches[0].start()].strip()
        if preamble:
            sections.append({"heading": None, "content": preamble})

    for idx, match in enumerate(matches):
        heading = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            sections.append({"heading": heading, "content": content})

    return sections


def build_knowledge_parts(
    pdf_path: Path,
    sections: list[dict],
    page_count: int,
    workflow_id: str = "",
) -> dict:
    """Build knowledge_parts.json from extracted sections.

    Output matches the knowledge-parts-schema.json used by the pipeline.
    """
    source_id = str(uuid.uuid4())
    doc_name = pdf_path.name
    doc_slug = re.sub(r"[^a-z0-9]", "-", doc_name.lower().rsplit(".", 1)[0])
    doc_slug = re.sub(r"-+", "-", doc_slug).strip("-")

    parts: list[dict] = []
    for idx, section in enumerate(sections, start=1):
        part_id = f"{doc_slug}-p-{idx:03d}"
        heading = section["heading"]
        extraction_path = json.dumps([heading] if heading else [])

        parts.append({
            "id": part_id,
            "source_id": source_id,
            "type": "text",
            "content": section["content"],
            "title": heading or "Preamble",
            "extraction_path": extraction_path,
        })

    return {
        "source": {
            "id": source_id,
            "workflow_id": workflow_id,
            "name": doc_name,
            "description": f"Text extraction from {doc_name}",
            "metadata": {
                "total_pages": page_count,
                "extraction_method": "pdftotext",
                "extracted_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        "parts": parts,
    }


def extract_single(
    pdftotext_bin: str,
    pdf_path: Path,
    output_path: Path,
    heading_pattern: str,
    workflow_id: str,
) -> bool:
    """Extract a single PDF. Returns True on success."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Extracting {pdf_path.name} via pdftotext...")
    raw_text, page_count = pdf_to_text(pdftotext_bin, pdf_path)
    text = clean_text(raw_text)

    if not text:
        print(f"ERROR: pdftotext produced empty output for {pdf_path}", file=sys.stderr)
        return False

    sections = split_on_headings(text, heading_pattern)
    if not sections:
        print(f"WARN: No sections found — treating entire document as one part", file=sys.stderr)
        sections = [{"heading": None, "content": text}]

    data = build_knowledge_parts(pdf_path, sections, page_count, workflow_id)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(
        f"  {len(data['parts'])} parts from {page_count} pages → {output_path}"
    )
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Fallback PDF extraction via pdftotext (no Docker required)"
    )
    parser.add_argument(
        "pdf", nargs="*",
        help="PDF path (single mode) or pdf:output pairs (batch mode)",
    )
    parser.add_argument("--output", "-o", help="Output path (single mode only)")
    parser.add_argument("--batch", action="store_true", help="Batch mode: args are pdf:output pairs")
    parser.add_argument(
        "--heading-pattern",
        default=r"(?m)^#{1,3}\s+(.+?)\s*$",
        help="Regex for headings (default: ## or ### headings)",
    )
    parser.add_argument("--workflow-id", default="", help="Workflow ID to set on source")
    args = parser.parse_args()

    pdftotext_bin = find_pdftotext()

    if args.batch:
        pairs: list[tuple[Path, Path]] = []
        for arg in args.pdf:
            if ":" not in arg:
                print(f"ERROR: Batch args must be 'pdf:output', got: {arg}", file=sys.stderr)
                sys.exit(1)
            pdf_str, out_str = arg.split(":", 1)
            pairs.append((Path(pdf_str), Path(out_str)))
        if not pairs:
            print("ERROR: No pdf:output pairs provided", file=sys.stderr)
            sys.exit(1)

        all_ok = True
        for pdf_path, output_path in pairs:
            if not pdf_path.exists():
                print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
                all_ok = False
                continue
            if not extract_single(pdftotext_bin, pdf_path, output_path, args.heading_pattern, args.workflow_id):
                all_ok = False

        if all_ok:
            print(f"\nAll {len(pairs)} documents extracted successfully!")
        sys.exit(0 if all_ok else 1)
    else:
        if not args.pdf:
            print("ERROR: Provide a PDF path", file=sys.stderr)
            sys.exit(1)
        pdf_path = Path(args.pdf[0])
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        if not args.output:
            print("ERROR: --output required in single mode", file=sys.stderr)
            sys.exit(1)
        ok = extract_single(pdftotext_bin, pdf_path, Path(args.output), args.heading_pattern, args.workflow_id)
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
