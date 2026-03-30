#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pymupdf4llm>=0.0.17"]
# ///
"""
Convert a PDF to Markdown using pymupdf4llm.

Primary extraction step for the vLLora finetune pipeline.
Run with: uv run convert_pdf_to_markdown.py input.pdf output.md
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a PDF to Markdown using pymupdf4llm."
    )
    parser.add_argument("input_pdf", type=Path, help="Path to the input PDF")
    parser.add_argument(
        "output_md",
        nargs="?",
        type=Path,
        help="Path to the output Markdown file (default: <input>.md)",
    )
    parser.add_argument(
        "--keep-header",
        action="store_true",
        help="Keep repeated page header content in the Markdown output",
    )
    parser.add_argument(
        "--keep-footer",
        action="store_true",
        help="Keep repeated page footer content in the Markdown output",
    )
    parser.add_argument(
        "--force-ocr",
        action="store_true",
        help="Force OCR on all pages",
    )
    parser.add_argument(
        "--disable-ocr",
        action="store_true",
        help="Disable OCR entirely",
    )
    parser.add_argument(
        "--force-text",
        action="store_true",
        help="Keep text output even when images/graphics overlap the page area",
    )
    parser.add_argument(
        "--write-images",
        action="store_true",
        help="Write extracted images to disk and reference them from Markdown",
    )
    parser.add_argument(
        "--embed-images",
        action="store_true",
        help="Embed extracted images as base64 data URIs in Markdown",
    )
    parser.add_argument(
        "--image-path",
        type=Path,
        help="Directory for extracted images when --write-images is used",
    )
    parser.add_argument(
        "--image-format",
        default="png",
        help="Image format for extracted images (default: png)",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=150,
        help="Image DPI for extracted or embedded images (default: 150)",
    )
    parser.add_argument(
        "--image-size-limit",
        type=float,
        default=0.05,
        help="Ignore images whose width or height is at or below this page fraction (default: 0.05)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.force_ocr and args.disable_ocr:
        print("--force-ocr and --disable-ocr cannot be used together.", file=sys.stderr)
        return 2
    if args.write_images and args.embed_images:
        print("--write-images and --embed-images cannot be used together.", file=sys.stderr)
        return 2
    if not 0 <= args.image_size_limit < 1:
        print("--image-size-limit must satisfy 0 <= value < 1.", file=sys.stderr)
        return 2

    input_pdf = args.input_pdf.expanduser().resolve()
    if not input_pdf.is_file():
        print(f"Input PDF not found: {input_pdf}", file=sys.stderr)
        return 1

    output_md = (
        args.output_md.expanduser().resolve()
        if args.output_md
        else input_pdf.with_suffix(".md")
    )

    image_path = None
    if args.image_path:
        image_path = args.image_path.expanduser().resolve()
    elif args.write_images:
        image_path = output_md.with_suffix("")
        image_path = image_path.parent / f"{image_path.name}-images"

    if image_path is not None:
        image_path.mkdir(parents=True, exist_ok=True)

    try:
        import pymupdf4llm
    except ImportError:
        print(
            "pymupdf4llm is not installed. Run with uv:\n"
            f"  uv run {__file__} '{input_pdf}' '{output_md}'",
            file=sys.stderr,
        )
        return 1

    md_text = pymupdf4llm.to_markdown(
        str(input_pdf),
        header=args.keep_header,
        footer=args.keep_footer,
        force_ocr=args.force_ocr,
        use_ocr=not args.disable_ocr,
        force_text=args.force_text,
        write_images=args.write_images,
        embed_images=args.embed_images,
        image_path=str(image_path) if image_path is not None else "",
        image_format=args.image_format,
        dpi=args.dpi,
        image_size_limit=args.image_size_limit,
    )
    output_md.write_text(md_text, encoding="utf-8")
    print(f"Wrote {len(md_text):,} chars to {output_md}")
    if image_path is not None:
        print(f"Wrote images to {image_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
