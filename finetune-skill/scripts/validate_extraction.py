"""
Validate extraction quality across all knowledge documents.

Runs quality gate checks on every knowledge_parts.json in the knowledge/
directory and prints a consolidated PASS/FAIL report. Use this after
extraction (Step 2) and before proceeding to topic generation (Step 3).

Usage:
    python validate_extraction.py finetune-project/knowledge/
    python validate_extraction.py finetune-project/knowledge/ --fix
"""

import json
import sys
import argparse
import subprocess
from pathlib import Path


def find_knowledge_parts(knowledge_dir: Path) -> list[Path]:
    """Find all knowledge_parts.json files in subdirectories."""
    return sorted(knowledge_dir.glob("*/knowledge_parts.json"))


def validate_file(path: Path) -> dict:
    """Validate a single knowledge_parts.json file."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    parts = data.get("parts", [])
    source = data.get("source", {})
    name = source.get("name", path.parent.name)
    total_pages = source.get("metadata", {}).get("total_pages")
    text_parts = [p for p in parts if p["type"] == "text"]

    issues = []

    # Check 1: Parts count
    if not parts:
        issues.append("FAIL: No parts found")
        return {"name": name, "parts": 0, "issues": issues, "overall": "FAIL"}

    # Check 2: Parts-per-page
    if total_pages and total_pages > 0:
        ppp = len(parts) / total_pages
        if ppp > 15:
            issues.append(f"FAIL: {ppp:.1f} parts/page (max 15) — merge adjacent text parts")
        elif ppp < 1:
            issues.append(f"WARN: {ppp:.1f} parts/page — extraction may be incomplete")

    # Check 3: Short parts
    if text_parts:
        short = [p for p in text_parts if len(p.get("content", "")) < 50]
        short_pct = len(short) / len(text_parts)
        if short_pct > 0.2:
            issues.append(
                f"FAIL: {len(short)}/{len(text_parts)} ({short_pct:.0%}) text parts <50 chars"
            )
        elif short_pct > 0.05:
            issues.append(
                f"WARN: {len(short)}/{len(text_parts)} ({short_pct:.0%}) text parts <50 chars"
            )

    # Check 4: Title diversity
    from collections import Counter
    titles = [p.get("title", "") for p in parts]
    title_counts = Counter(titles)
    if title_counts:
        top_title, top_count = title_counts.most_common(1)[0]
        diversity = 1 - (top_count / len(parts))
        if diversity < 0.5:
            issues.append(
                f"FAIL: Title diversity {diversity:.0%} — "
                f"'{top_title}' appears {top_count}/{len(parts)} times"
            )

    # Check 5: Average content length
    if text_parts:
        avg_len = sum(len(p.get("content", "")) for p in text_parts) / len(text_parts)
        if avg_len < 100:
            issues.append(f"FAIL: Avg content length {avg_len:.0f} chars (min 100)")
        elif avg_len < 200:
            issues.append(f"WARN: Avg content length {avg_len:.0f} chars (target 200+)")

    # Check 6: Unicode encoding
    unicode_count = 0
    for p in parts:
        for field in ("content", "title", "extraction_path"):
            val = p.get(field, "")
            if isinstance(val, str) and ("\\u0" in val or "\\u04" in val):
                unicode_count += 1
                break
    if unicode_count > 0:
        issues.append(f"FAIL: {unicode_count} parts have unescaped Unicode sequences")

    # Check 7: Empty content
    empty = [p for p in parts if not p.get("content", "").strip()]
    if empty:
        issues.append(f"WARN: {len(empty)} parts have empty content")

    # Check 8: Extraction path quality
    paths = set(p.get("extraction_path", "") for p in parts if p.get("extraction_path"))
    if len(paths) <= 2 and len(parts) > 10:
        issues.append(
            f"WARN: Only {len(paths)} unique extraction paths for {len(parts)} parts"
        )

    overall = "FAIL" if any(i.startswith("FAIL") for i in issues) else \
              "WARN" if any(i.startswith("WARN") for i in issues) else "PASS"

    return {
        "name": name,
        "parts": len(parts),
        "text": len(text_parts),
        "table": len([p for p in parts if p["type"] == "table"]),
        "image": len([p for p in parts if p["type"] == "image"]),
        "pages": total_pages,
        "issues": issues,
        "overall": overall,
    }


def main():
    parser = argparse.ArgumentParser(description="Validate extraction quality")
    parser.add_argument("knowledge_dir", help="Path to knowledge/ directory")
    parser.add_argument("--fix", action="store_true",
                        help="Auto-fix by running consolidate_parts.py on failing files")
    args = parser.parse_args()

    knowledge_dir = Path(args.knowledge_dir)
    if not knowledge_dir.is_dir():
        print(f"ERROR: Not a directory: {knowledge_dir}", file=sys.stderr)
        sys.exit(1)

    files = find_knowledge_parts(knowledge_dir)
    if not files:
        print(f"ERROR: No knowledge_parts.json files found in {knowledge_dir}/*/")
        sys.exit(1)

    print(f"=== Extraction Quality Validation ===")
    print(f"Found {len(files)} document(s) in {knowledge_dir}\n")

    all_results = []
    any_fail = False

    for path in files:
        result = validate_file(path)
        all_results.append((path, result))

        status = result["overall"]
        if status == "FAIL":
            any_fail = True

        # Print per-document summary
        parts_info = f"{result['parts']} parts"
        if result.get("pages"):
            ppp = result["parts"] / result["pages"]
            parts_info += f" ({ppp:.1f}/page)"
        type_info = f"{result['text']}T {result['table']}Tb {result['image']}I"

        print(f"[{status}] {result['name']}")
        print(f"      {parts_info} | {type_info}")
        for issue in result["issues"]:
            print(f"      → {issue}")
        print()

    # Summary
    pass_count = sum(1 for _, r in all_results if r["overall"] == "PASS")
    warn_count = sum(1 for _, r in all_results if r["overall"] == "WARN")
    fail_count = sum(1 for _, r in all_results if r["overall"] == "FAIL")
    total_parts = sum(r["parts"] for _, r in all_results)

    print(f"--- Summary ---")
    print(f"Documents: {len(files)} | Total parts: {total_parts}")
    print(f"PASS: {pass_count} | WARN: {warn_count} | FAIL: {fail_count}")

    if any_fail and args.fix:
        print(f"\n--- Auto-fixing {fail_count} failing document(s) ---\n")
        script_dir = Path(__file__).parent
        consolidate_script = script_dir / "consolidate_parts.py"

        for path, result in all_results:
            if result["overall"] != "FAIL":
                continue
            print(f"Fixing: {path}")
            try:
                subprocess.run(
                    [sys.executable, str(consolidate_script), str(path)],
                    check=True,
                )
                print()
            except subprocess.CalledProcessError:
                print(f"  Fix attempt did not fully resolve issues for {path}")
                print()

        # Re-validate after fixes
        print("--- Re-validating after fixes ---\n")
        still_failing = False
        for path, _ in all_results:
            result = validate_file(path)
            status = result["overall"]
            if status == "FAIL":
                still_failing = True
            print(f"[{status}] {result['name']}: {result['parts']} parts")
            for issue in result["issues"]:
                print(f"      → {issue}")

        if still_failing:
            print("\nSome documents still have issues. Manual extraction script fixes required.")
            sys.exit(1)
        else:
            print("\nAll documents pass quality gates after consolidation.")
            sys.exit(0)

    elif any_fail:
        print(f"\nFAIL: {fail_count} document(s) need fixes before uploading.")
        print("Run with --fix to auto-consolidate, or fix the extraction script manually.")
        sys.exit(1)
    else:
        print(f"\nPASS: All documents ready to upload.")
        sys.exit(0)


if __name__ == "__main__":
    main()
