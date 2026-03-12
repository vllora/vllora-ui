import argparse
import json
import re
import uuid
from pathlib import Path
from typing import Callable


SectionParts = dict[str, str | None]
SectionExtractor = Callable[[str, list[SectionParts]], dict]


def clean_text(text: str) -> str:
    text = re.sub(r"(?m)^<!-- page-break -->\s*$\n?", "", text)
    text = re.sub(r"!\[Image\]\(data:image/[^\n]+\)", "[Image omitted]", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_markdown_sections(text: str, heading_pattern: str = r"(?m)^##\s+(.+?)\s*$") -> list[SectionParts]:
    matches = list(re.finditer(heading_pattern, text))
    sections: list[SectionParts] = []

    if not matches:
        body = text.strip()
        return [{"heading": None, "content": body}] if body else []

    if matches[0].start() > 0:
        preamble = text[: matches[0].start()].strip()
        if preamble:
            sections.append({"heading": None, "content": preamble})

    for index, match in enumerate(matches):
        heading = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        sections.append({"heading": heading, "content": content})

    return sections


def build_document(
    document_title: str | None,
    sections: list[dict[str, str]],
    source_file: str | None = None,
    workflow_id: str | None = None,
) -> dict:
    source_id = str(uuid.uuid4())
    parts = []

    for idx, section in enumerate(sections, start=1):
        part_id = f"p-{idx:03d}"
        title = section["title"]
        extraction_path = json.dumps([title] if title else ["Untitled"])
        parts.append({
            "id": part_id,
            "source_id": source_id,
            "type": "text",
            "content": section["content"],
            "title": title or "Untitled",
            "extraction_path": extraction_path,
        })

    return {
        "source": {
            "id": source_id,
            "workflow_id": workflow_id or "",
            "name": source_file or "unknown",
            "description": document_title or "Untitled Document",
            "metadata": {
                "extraction_method": "pdftotext",
            },
        },
        "parts": parts,
    }


def extract_heading_sections(
    raw_text: str,
    skip_headings: set[str] | None = None,
    heading_pattern: str = r"(?m)^##\s+(.+?)\s*$",
) -> dict:
    text = clean_text(raw_text)
    parts = split_markdown_sections(text, heading_pattern=heading_pattern)

    doc_title = None
    sections: list[dict[str, str]] = []
    skipped = skip_headings or set()

    for part in parts:
        heading = part["heading"]
        content = (part["content"] or "").strip()

        if heading is None:
            continue

        if doc_title is None:
            doc_title = heading
            continue

        if heading == doc_title or heading in skipped:
            continue

        if not content:
            continue

        sections.append(
            {
                "title": heading,
                "content": f"## {heading}\n\n{content}".strip(),
            }
        )

    return build_document(doc_title, sections)


def extract_with_strategy(raw_text: str, extractor: SectionExtractor) -> dict:
    text = clean_text(raw_text)
    parts = split_markdown_sections(text)
    return extractor(text, parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract generic heading-based sections from markdown.")
    parser.add_argument("input", help="Input markdown file")
    parser.add_argument("output", nargs="?", default="sections.json", help="Output JSON file")
    parser.add_argument("--source-file", help="Original source filename (e.g., 'document.pdf')")
    parser.add_argument("--workflow-id", help="Workflow ID to set on the source")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    data = extract_heading_sections(input_path.read_text(encoding="utf-8"))

    # Override source metadata if provided via CLI
    if args.source_file:
        data["source"]["name"] = args.source_file
    if args.workflow_id:
        data["source"]["workflow_id"] = args.workflow_id

    output_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(data['parts'])} parts to {output_path}")


if __name__ == "__main__":
    main()
