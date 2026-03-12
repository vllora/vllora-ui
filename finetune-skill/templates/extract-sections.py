import argparse
import json
import re
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


def build_document(document_title: str | None, sections: list[dict[str, str]]) -> dict:
    return {
        "document_title": document_title or "Untitled Document",
        "sections": sections,
    }


def extract_heading_sections(
    raw_text: str,
    skip_headings: set[str] | None = None,
    heading_pattern: str = r"(?m)^##\s+(.+?)\s*$",
) -> dict:
    text = clean_text(raw_text)
    parts = split_markdown_sections(text, heading_pattern=heading_pattern)

    title = None
    sections: list[dict[str, str]] = []
    skipped = skip_headings or set()

    for part in parts:
        heading = part["heading"]
        content = (part["content"] or "").strip()

        if heading is None:
            continue

        if title is None:
            title = heading
            continue

        if heading == title or heading in skipped:
            continue

        if not content:
            continue

        sections.append(
            {
                "section_heading": heading,
                "section_text": f"## {heading}\n\n{content}".strip(),
            }
        )

    return build_document(title, sections)


def extract_with_strategy(raw_text: str, extractor: SectionExtractor) -> dict:
    text = clean_text(raw_text)
    parts = split_markdown_sections(text)
    return extractor(text, parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract generic heading-based sections from markdown.")
    parser.add_argument("input", help="Input markdown file")
    parser.add_argument("output", nargs="?", default="sections.json", help="Output JSON file")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    data = extract_heading_sections(input_path.read_text(encoding="utf-8"))
    output_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(data['sections'])} sections to {output_path}")


if __name__ == "__main__":
    main()
