# /// script
# requires-python = ">=3.10"
# ///
"""
system_prompt_rewriter.py — Stage 5: extract + rewrite the system prompt.

Stage 5 is the ONLY stage in the trace pipeline that involves an LLM
call, and it happens exactly once at workflow-creation time — not per
record. The rewritten prompt is then applied identically to every
training record (consistency is mandatory per OpenAI's fine-tuning
best practices; see `otel-traces-as-finetune-input.md` §"System prompt").

Two steps:

  1. **Extract** the most common system prompt across the bundle.
     Records without a system message are skipped. Ties broken by
     first occurrence. The raw demonstrator prompt is the structural
     baseline — it tells the student what role it's playing.

  2. **Rewrite** for the student model via an LLM call. The rewrite
     strips dynamic context (dates, user IDs), demonstrator-specific
     capability claims, and shortens to fit the student's context
     budget. See the system prompt section of the design doc for the
     full rewrite checklist.

The LLM call is pluggable — callers inject a `rewrite_fn` callable so
unit tests can stub deterministic output without a real API dependency.

Usage:
    python3 system_prompt_rewriter.py training.jsonl \\
        --tool-schema tools.json \\
        --output system_prompt.txt
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Callable

RewriteFn = Callable[[str, list[dict]], str]


# ─── Extraction ────────────────────────────────────────────────────────────


def extract_system_prompt(record: dict) -> str | None:
    """Return the first system message's content, or None if absent."""
    for msg in record.get("messages") or []:
        if msg.get("role") == "system":
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                return content
    return None


def most_common_system_prompt(records: list[dict]) -> str | None:
    """Return the most common non-empty system prompt across records.

    Ties are broken by first occurrence (Counter.most_common is stable
    on insertion order in CPython 3.7+). Returns None if no record in
    the bundle has a system message.
    """
    prompts = [p for p in (extract_system_prompt(r) for r in records) if p]
    if not prompts:
        return None
    return Counter(prompts).most_common(1)[0][0]


# ─── Rewrite ───────────────────────────────────────────────────────────────


DEFAULT_REWRITE_INSTRUCTIONS = """\
You are rewriting a system prompt lifted from an agent's production
traces so it can be used as the system prompt for a smaller student
model during GRPO fine-tuning. Apply these rules:

1. Drop dynamic context (current date, user IDs, session state, RAG
   snippets) — anything that would vary per record.
2. Drop capability claims the student model can't fulfill.
3. Keep the role, task, and behavioral instructions.
4. Refer only to the tools in the provided schema — drop any tools
   the student won't have at inference.
5. Shorten to fit a small-model context budget.

Return ONLY the rewritten system prompt text, no preamble.
"""


def rewrite_system_prompt(
    original: str,
    tool_schema: list[dict],
    rewrite_fn: RewriteFn,
) -> str:
    """Rewrite `original` for the student model via `rewrite_fn`.

    `rewrite_fn(original_prompt, tool_schema)` is the injected LLM
    call. Unit tests pass a deterministic stub; production callers
    pass a function that calls an actual LLM API.

    The returned string is stripped of leading/trailing whitespace and
    must be non-empty — a rewrite_fn that returns empty is a bug and
    raises ValueError.
    """
    if not isinstance(original, str) or not original.strip():
        raise ValueError("original system prompt must be a non-empty string")

    rewritten = rewrite_fn(original, tool_schema)
    if not isinstance(rewritten, str):
        raise ValueError(
            f"rewrite_fn must return a string, got {type(rewritten).__name__}"
        )
    rewritten = rewritten.strip()
    if not rewritten:
        raise ValueError("rewrite_fn returned an empty string")
    return rewritten


def build_system_prompt(
    records: list[dict],
    tool_schema: list[dict],
    rewrite_fn: RewriteFn,
    *,
    fallback: str | None = None,
) -> str:
    """End-to-end: extract the most common prompt and rewrite it.

    If no record has a system message, `fallback` is used as the
    starting point (and still rewritten). If `fallback` is None and
    no extraction is possible, raises ValueError.
    """
    original = most_common_system_prompt(records)
    if original is None:
        if fallback is None:
            raise ValueError(
                "no system prompt found in any record and no fallback supplied"
            )
        original = fallback
    return rewrite_system_prompt(original, tool_schema, rewrite_fn)


# ─── CLI ───────────────────────────────────────────────────────────────────


def load_jsonl(path: Path) -> list[dict]:
    records: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    return records


def _identity_rewrite(original: str, tool_schema: list[dict]) -> str:
    """CLI fallback rewrite: pass-through without modification.

    Tool definitions already live in each record's `tools` array —
    appending tool names to the system prompt text is redundant,
    inflates system_prompt.txt (e.g., 174KB vs 1KB), and can confuse
    the student model during training. Real rewrites happen via the
    Python API with an injected LLM-backed rewrite_fn.
    """
    return original.strip()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract + rewrite the Stage 5 system prompt"
    )
    parser.add_argument("records", type=Path, help="Training records JSONL")
    parser.add_argument(
        "--tool-schema",
        type=Path,
        required=True,
        help="Tool schema JSON (from trace_topics.py or trace_grader_builder.py)",
    )
    parser.add_argument("--output", type=Path, required=True, help="Output prompt text")
    parser.add_argument(
        "--fallback",
        type=str,
        default=None,
        help="Fallback prompt used if no record has a system message",
    )
    args = parser.parse_args()

    records = load_jsonl(args.records)
    tool_schema = json.loads(args.tool_schema.read_text())

    prompt = build_system_prompt(
        records, tool_schema, _identity_rewrite, fallback=args.fallback
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(prompt)
    print(f"wrote system prompt → {args.output} ({len(prompt)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
