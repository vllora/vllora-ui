# /// script
# requires-python = ">=3.10"
# dependencies = ["requests>=2.31"]
# ///
"""
Submit PDF(s) to Docling Serve (async) and poll until done.

Handles the async lifecycle: submit → poll status → fetch result → save.
This avoids the sync endpoint's timeout limit for large documents.

Single file:
    uv run scripts/docling_extract.py document.pdf -o knowledge/doc-slug/docling-result.json

Batch mode (submit all, poll all in parallel):
    uv run scripts/docling_extract.py --batch \\
      doc1.pdf:knowledge/doc1/docling-result.json \\
      doc2.pdf:knowledge/doc2/docling-result.json \\
      doc3.pdf:knowledge/doc3/docling-result.json
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import requests


def is_digital_pdf(pdf_path: Path) -> bool:
    """Detect if a PDF has selectable text (digital) or needs OCR (scanned).

    Samples a few content pages (skipping title/TOC) and checks word count.
    Returns True if the PDF is digital (has extractable text).
    """
    try:
        # Sample pages 3-6 (skip title/TOC pages which may be sparse)
        result = subprocess.run(
            ["pdftotext", "-f", "3", "-l", "6", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=10,
        )
        word_count = len(result.stdout.split())
        return word_count > 50  # 50+ words from 4 pages = has selectable text
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False  # pdftotext not installed or timeout — assume scanned, use OCR


def submit_async(
    docling_url: str,
    pdf_path: Path,
    max_tokens: int = 8192,
    force_ocr: bool | None = None,
) -> str:
    """Submit a PDF to Docling async endpoint, return task_id.

    OCR is auto-detected: disabled for digital PDFs (30-50% faster),
    enabled for scanned PDFs. Use force_ocr to override.
    """
    # Auto-detect OCR need unless explicitly set
    if force_ocr is None:
        digital = is_digital_pdf(pdf_path)
        do_ocr = not digital
        if digital:
            print(f"  Auto-detected digital PDF — skipping OCR (faster)")
        else:
            print(f"  Auto-detected scanned PDF — enabling OCR")
    else:
        do_ocr = force_ocr

    url = f"{docling_url}/v1/chunk/hybrid/file/async"
    data = {
        "chunking_max_tokens": str(max_tokens),
        "chunking_merge_peers": "true",
        "chunking_use_markdown_tables": "true",
        "chunking_tokenizer": "BAAI/bge-small-en-v1.5",
        "convert_do_ocr": "true" if do_ocr else "false",
        "convert_do_table_structure": "true",
        "convert_include_images": "true",
        "convert_image_export_mode": "embedded",
        "include_converted_doc": "true",
    }

    with open(pdf_path, "rb") as f:
        resp = requests.post(url, data=data, files=[("files", (pdf_path.name, f, "application/pdf"))])

    resp.raise_for_status()
    resp_data = resp.json()
    task_id = resp_data.get("task_id")
    if not task_id:
        print(f"ERROR: No task_id in response: {resp_data}", file=sys.stderr)
        sys.exit(1)
    return task_id


def _write_status(output_path: Path, status_data: dict) -> None:
    """Write extraction status to docling-status.json alongside the output file."""
    status_path = output_path.parent / "docling-status.json"
    status_path.write_text(json.dumps(status_data, indent=2))


def poll_until_done(
    docling_url: str,
    task_id: str,
    output_path: Path,
    poll_interval: int = 15,
    max_wait: int = 1800,
) -> bool:
    """Poll Docling status until task completes or fails. Returns True on success.

    Writes docling-status.json to the output directory on each poll with:
    task_id, status, poll_count, elapsed_seconds, queue_position, last_checked.
    """
    task_id = _validate_task_id(task_id)
    url = f"{docling_url}/v1/status/poll/{task_id}"
    elapsed = 0
    attempt = 0

    while elapsed < max_wait:
        attempt += 1
        try:
            resp = requests.get(url)
            resp.raise_for_status()
            data = resp.json()
            status = data.get("task_status", data.get("status", "unknown"))
            pos = data.get("task_position", "")

            # Write status file on every poll
            _write_status(output_path, {
                "task_id": task_id,
                "status": status,
                "poll_count": attempt,
                "elapsed_seconds": elapsed,
                "queue_position": pos or None,
                "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "pdf": output_path.parent.name,
            })

            if status in ("success", "completed"):
                print(f"  [{attempt}] Docling completed after {elapsed}s")
                return True
            if status in ("failed", "error"):
                error = data.get("error", data.get("detail", "unknown error"))
                print(f"ERROR: Docling task failed: {error}", file=sys.stderr)
                return False

            pos_info = f", queue_pos={pos}" if pos else ""
            print(f"  [{attempt}] status={status}{pos_info}, elapsed={elapsed}s")
        except requests.RequestException as e:
            print(f"  [{attempt}] Poll error: {e}, retrying...")

        time.sleep(poll_interval)
        elapsed += poll_interval

    print(f"ERROR: Docling timed out after {max_wait}s", file=sys.stderr)
    return False


def fetch_result(docling_url: str, task_id: str) -> dict:
    """Fetch the completed result from Docling."""
    url = f"{docling_url}/v1/result/{task_id}"
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.json()


def extract_single(
    docling_url: str,
    pdf_path: Path,
    output_path: Path,
    max_tokens: int,
    poll_interval: int,
    max_wait: int,
    skip_existing: bool = False,
) -> bool:
    """Extract a single PDF. Returns True on success."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Skip if result already exists (reuse previous extraction)
    if skip_existing and output_path.exists():
        try:
            data = json.loads(output_path.read_text())
            chunks = data if isinstance(data, list) else data.get("chunks", data.get("results", []))
            if chunks:
                size_mb = output_path.stat().st_size / (1024 * 1024)
                print(f"Reusing existing extraction: {output_path} ({size_mb:.1f}MB, {len(chunks)} chunks)")
                _write_status(output_path, {
                    "task_id": None,
                    "status": "reused_existing",
                    "poll_count": 0,
                    "elapsed_seconds": 0,
                    "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "pdf": pdf_path.name,
                    "note": "docling-result.json already existed with valid data — skipped re-extraction",
                })
                return True
        except (json.JSONDecodeError, OSError):
            print(f"  Existing {output_path} is invalid — re-extracting")

    print(f"Submitting {pdf_path.name} to Docling (async, max_tokens={max_tokens})...")
    task_id = submit_async(docling_url, pdf_path, max_tokens)
    print(f"  Task ID: {task_id}")

    # Write initial status
    _write_status(output_path, {
        "task_id": task_id,
        "status": "submitted",
        "poll_count": 0,
        "elapsed_seconds": 0,
        "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "pdf": pdf_path.name,
    })

    print(f"Polling for completion (interval={poll_interval}s, max={max_wait}s)...")
    if not poll_until_done(docling_url, task_id, output_path, poll_interval, max_wait):
        return False

    print("Fetching result...")
    result = fetch_result(docling_url, task_id)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    chunks = len(result.get("chunks", []))
    docs = len(result.get("documents", []))
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Saved: {output_path} ({size_mb:.1f}MB, {chunks} chunks, {docs} documents)")
    return True


def extract_batch(
    docling_url: str,
    pairs: list[tuple[Path, Path]],
    max_tokens: int,
    poll_interval: int,
    max_wait: int,
    skip_existing: bool = False,
) -> bool:
    """Submit all PDFs first, then poll all in parallel. Returns True if all succeed."""
    # Submit all (skip existing if requested)
    tasks: list[tuple[str, Path, Path]] = []
    skipped = 0
    for pdf_path, output_path in pairs:
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            return False
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Skip if result already exists
        if skip_existing and output_path.exists():
            try:
                data = json.loads(output_path.read_text())
                chunks = data if isinstance(data, list) else data.get("chunks", data.get("results", []))
                if chunks:
                    size_mb = output_path.stat().st_size / (1024 * 1024)
                    print(f"Reusing existing: {pdf_path.name} ({size_mb:.1f}MB, {len(chunks)} chunks)")
                    _write_status(output_path, {
                        "task_id": None, "status": "reused_existing", "poll_count": 0,
                        "elapsed_seconds": 0, "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        "pdf": pdf_path.name,
                    })
                    skipped += 1
                    continue
            except (json.JSONDecodeError, OSError):
                print(f"  Existing {output_path} is invalid — re-extracting")

        print(f"Submitting {pdf_path.name}...")
        task_id = submit_async(docling_url, pdf_path, max_tokens)
        print(f"  Task ID: {task_id}")
        _write_status(output_path, {
            "task_id": task_id, "status": "submitted", "poll_count": 0,
            "elapsed_seconds": 0, "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "pdf": pdf_path.name,
        })
        tasks.append((task_id, pdf_path, output_path))

    if skipped:
        print(f"\nSkipped {skipped} document(s) with existing extractions.")

    if not tasks:
        print(f"\nAll documents already extracted — nothing to submit.")
        return True

    print(f"\nAll {len(tasks)} PDFs submitted. Polling for completion...\n")

    # Poll all until done
    pending = {task_id: (pdf_path, output_path) for task_id, pdf_path, output_path in tasks}
    elapsed = 0
    attempt = 0

    while pending and elapsed < max_wait:
        attempt += 1
        completed_this_round = []
        for task_id, (pdf_path, output_path) in pending.items():
            try:
                resp = requests.get(f"{docling_url}/v1/status/poll/{task_id}")
                resp.raise_for_status()
                data = resp.json()
                status = data.get("task_status", data.get("status", "unknown"))

                # Write status on every poll
                pos = data.get("task_position", "")
                _write_status(output_path, {
                    "task_id": task_id, "status": status, "poll_count": attempt,
                    "elapsed_seconds": elapsed, "queue_position": pos or None,
                    "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "pdf": pdf_path.name,
                })

                if status in ("success", "completed"):
                    print(f"  [{attempt}] {pdf_path.name} completed after {elapsed}s")
                    result = fetch_result(docling_url, task_id)
                    with open(output_path, "w", encoding="utf-8") as f:
                        json.dump(result, f, ensure_ascii=False)
                    chunks = len(result.get("chunks", []))
                    size_mb = output_path.stat().st_size / (1024 * 1024)
                    print(f"    Saved: {output_path} ({size_mb:.1f}MB, {chunks} chunks)")
                    completed_this_round.append(task_id)
                elif status in ("failed", "error"):
                    error = data.get("error", data.get("detail", "unknown"))
                    print(f"ERROR: {pdf_path.name} failed: {error}", file=sys.stderr)
                    return False
                else:
                    pos_info = f" (queue #{pos})" if pos else ""
                    print(f"  [{attempt}] {pdf_path.name}: {status}{pos_info}")
            except requests.RequestException as e:
                print(f"  [{attempt}] {pdf_path.name}: poll error: {e}")

        for task_id in completed_this_round:
            del pending[task_id]

        if pending:
            time.sleep(poll_interval)
            elapsed += poll_interval

    if pending:
        names = [p.name for p, _ in pending.values()]
        print(f"ERROR: Timed out after {max_wait}s. Still pending: {names}", file=sys.stderr)
        return False

    print(f"\nAll {len(tasks)} documents extracted successfully!")
    return True


def submit_batch_only(
    docling_url: str,
    pairs: list[tuple[Path, Path]],
    max_tokens: int,
    skip_existing: bool = False,
) -> list[dict]:
    """Submit all PDFs without waiting. Returns a manifest of task entries.

    With skip_existing=True, PDFs whose output file already contains valid data
    get a manifest entry with status='reused_existing' and task_id=None — no
    Docling request is made.
    """
    manifest = []
    for pdf_path, output_path in pairs:
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Skip if result already exists
        if skip_existing and output_path.exists():
            try:
                data = json.loads(output_path.read_text())
                chunks = data if isinstance(data, list) else data.get("chunks", data.get("results", []))
                if chunks:
                    size_mb = output_path.stat().st_size / (1024 * 1024)
                    print(f"Reusing existing: {pdf_path.name} ({size_mb:.1f}MB, {len(chunks)} chunks)")
                    manifest.append({
                        "task_id": None,
                        "pdf": str(pdf_path),
                        "output": str(output_path),
                        "status": "reused_existing",
                    })
                    continue
            except (json.JSONDecodeError, OSError):
                print(f"  Existing {output_path} is invalid — submitting to Docling")

        print(f"Submitting {pdf_path.name}...")
        task_id = submit_async(docling_url, pdf_path, max_tokens)
        entry = {
            "task_id": task_id,
            "pdf": str(pdf_path),
            "output": str(output_path),
            "status": "submitted",
        }
        manifest.append(entry)
        print(f"  Task ID: {task_id}")
    return manifest


def _validate_task_id(task_id: str) -> str:
    """Validate and clean a task ID. Strips output paths accidentally appended with ':'."""
    if ":" in task_id:
        # Agent may have passed "task_id:output_path" — extract just the UUID
        clean = task_id.split(":")[0]
        print(f"  Warning: task_id contained ':' — extracted UUID: {clean}", file=sys.stderr)
        return clean
    if "/" in task_id:
        print(f"  Warning: task_id contains '/' — this looks like a path, not a UUID: {task_id}", file=sys.stderr)
    return task_id.strip()


def poll_one_task(
    docling_url: str,
    task_id: str,
    output_path: Path,
) -> dict:
    """Poll a single task. Returns status dict with 'status' field.
    If completed, fetches result and saves to output_path.
    Also writes docling-status.json alongside the output."""
    task_id = _validate_task_id(task_id)
    try:
        resp = requests.get(f"{docling_url}/v1/status/poll/{task_id}", timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("task_status", data.get("status", "unknown"))
        pos = data.get("task_position", "")

        status_info = {
            "task_id": task_id, "status": status,
            "queue_position": pos or None,
            "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "pdf": output_path.parent.name,
        }

        if status in ("success", "completed"):
            result = fetch_result(docling_url, task_id)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            chunks = len(result.get("chunks", []))
            size_mb = output_path.stat().st_size / (1024 * 1024)
            status_info.update({"status": "completed", "chunks": chunks, "size_mb": round(size_mb, 1)})
            _write_status(output_path, status_info)
            return status_info
        elif status in ("failed", "error"):
            error = data.get("error", data.get("detail", "unknown"))
            status_info["error"] = error
            _write_status(output_path, status_info)
            return status_info
        else:
            _write_status(output_path, status_info)
            return status_info
    except requests.RequestException as e:
        return {"status": "error", "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Extract PDF(s) via Docling async API")
    parser.add_argument("pdf", nargs="*", help="PDF path (single mode) or pdf:output pairs (batch mode)")
    parser.add_argument("--output", "-o", help="Output path (single mode only)")
    parser.add_argument("--batch", action="store_true", help="Batch mode: args are pdf:output pairs")
    parser.add_argument("--submit-only", action="store_true", help="Submit all PDFs and return manifest JSON (don't wait)")
    parser.add_argument("--poll-one", help="Poll a single task_id and fetch result if done. Requires --output.")
    parser.add_argument("--docling-url", default="http://localhost:5001", help="Docling Serve URL")
    parser.add_argument("--max-tokens", type=int, default=8192, help="Max tokens per Docling chunk — safety ceiling, not target size (default: 8192)")
    parser.add_argument("--poll-interval", type=int, default=15, help="Poll interval in seconds (default: 15)")
    parser.add_argument("--max-wait", type=int, default=1800, help="Max wait time in seconds (default: 1800)")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip documents where docling-result.json already exists with valid data")
    args = parser.parse_args()

    # Check Docling health
    try:
        health = requests.get(f"{args.docling_url}/health", timeout=5)
        health.raise_for_status()
    except requests.RequestException:
        print(f"ERROR: Docling not reachable at {args.docling_url}", file=sys.stderr)
        sys.exit(1)

    # --poll-one: check status of a single task
    if args.poll_one:
        if not args.output:
            print("ERROR: --output required with --poll-one", file=sys.stderr)
            sys.exit(1)
        result = poll_one_task(args.docling_url, args.poll_one, Path(args.output))
        print(json.dumps(result))
        sys.exit(0 if result["status"] != "failed" else 1)

    # --submit-only: submit all and return manifest
    if args.submit_only:
        pairs: list[tuple[Path, Path]] = []
        for arg in args.pdf:
            if ":" not in arg:
                print(f"ERROR: Args must be 'pdf:output', got: {arg}", file=sys.stderr)
                sys.exit(1)
            pdf_str, out_str = arg.split(":", 1)
            pairs.append((Path(pdf_str), Path(out_str)))
        if not pairs:
            print("ERROR: No pdf:output pairs provided", file=sys.stderr)
            sys.exit(1)
        manifest = submit_batch_only(args.docling_url, pairs, args.max_tokens,
                                     skip_existing=args.skip_existing)
        print(json.dumps(manifest, indent=2))
        sys.exit(0)

    if args.batch:
        # Batch mode: each arg is "pdf_path:output_path"
        pairs = []
        for arg in args.pdf:
            if ":" not in arg:
                print(f"ERROR: Batch args must be 'pdf:output', got: {arg}", file=sys.stderr)
                sys.exit(1)
            pdf_str, out_str = arg.split(":", 1)
            pairs.append((Path(pdf_str), Path(out_str)))
        if not pairs:
            print("ERROR: No pdf:output pairs provided", file=sys.stderr)
            sys.exit(1)
        ok = extract_batch(args.docling_url, pairs, args.max_tokens, args.poll_interval, args.max_wait,
                           skip_existing=args.skip_existing)
        sys.exit(0 if ok else 1)
    else:
        # Single mode
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
        ok = extract_single(
            args.docling_url, pdf_path, Path(args.output),
            args.max_tokens, args.poll_interval, args.max_wait,
            skip_existing=args.skip_existing,
        )
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
