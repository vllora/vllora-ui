#!/usr/bin/env python3
"""
Converts Claude Code stream-json output to a readable markdown transcript.

Reads JSONL from stdin (piped from `claude --output-format stream-json`).
Writes formatted markdown to the file specified as argv[1].
Also prints a compact live progress line to stderr.

Usage:
  claude -p "..." --output-format stream-json | python3 format-finetune-log.py transcript.md
"""

import json
import sys
import os
from datetime import datetime

def truncate(text: str, max_len: int = 200) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."

def format_tool_input(tool_name: str, tool_input: dict) -> str:
    """Format tool input for readability."""
    if tool_name == "Bash":
        return tool_input.get("command", str(tool_input))
    if tool_name in ("Read", "Write", "Edit"):
        return tool_input.get("file_path", str(tool_input))
    if tool_name == "Grep":
        pattern = tool_input.get("pattern", "")
        path = tool_input.get("path", "")
        return f'pattern="{pattern}" path="{path}"'
    if tool_name == "Glob":
        return tool_input.get("pattern", str(tool_input))
    if tool_name == "Agent":
        desc = tool_input.get("description", "")
        agent_type = tool_input.get("subagent_type", "")
        return f'{agent_type}: {desc}' if agent_type else desc
    # Default: compact JSON
    try:
        compact = json.dumps(tool_input, ensure_ascii=False)
        return truncate(compact, 300)
    except (TypeError, ValueError):
        return str(tool_input)

def main():
    if len(sys.argv) < 2:
        print("Usage: format-finetune-log.py <output.md>", file=sys.stderr)
        sys.exit(1)

    md_path = sys.argv[1]
    md_file = open(md_path, "a", encoding="utf-8")

    turn_count = 0
    tool_count = 0
    current_text = ""
    last_role = None

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type", "")

            # ── Assistant message (text content) ──
            if event_type == "assistant":
                turn_count += 1
                content = event.get("message", {}).get("content", [])
                text_parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.append(block.get("text", ""))

                if text_parts:
                    text = "\n".join(text_parts)
                    ts = datetime.now().strftime("%H:%M:%S")
                    md_file.write(f"\n## Turn {turn_count} — {ts}\n\n")
                    md_file.write(f"{text}\n")
                    md_file.flush()

                    # Live progress
                    preview = truncate(text.replace("\n", " "), 100)
                    print(f"\r[Turn {turn_count}] {preview}", end="", file=sys.stderr)

            # ── Tool use ──
            elif event_type == "tool_use":
                tool_count += 1
                tool_name = event.get("name", "unknown")
                tool_input = event.get("input", {})
                formatted = format_tool_input(tool_name, tool_input)

                md_file.write(f"\n### 🔧 {tool_name}\n\n")
                md_file.write(f"```\n{formatted}\n```\n\n")
                md_file.flush()

                preview = truncate(formatted.replace("\n", " "), 80)
                print(f"\r  🔧 {tool_name}: {preview}", end="", file=sys.stderr)

            # ── Tool result ──
            elif event_type == "tool_result":
                content = event.get("content", "")
                if isinstance(content, list):
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                    content = "\n".join(text_parts)

                # Truncate large results in markdown (full data is in the JSONL)
                display = truncate(str(content), 1000)
                md_file.write(f"<details><summary>Result ({len(str(content))} chars)</summary>\n\n")
                md_file.write(f"```\n{display}\n```\n\n")
                md_file.write(f"</details>\n\n")
                md_file.flush()

            # ── Result (final) ──
            elif event_type == "result":
                result_text = event.get("result", "")
                session_id = event.get("session_id", "")
                usage = event.get("usage", {})
                cost = event.get("cost_usd", 0)
                duration = event.get("duration_ms", 0)

                md_file.write(f"\n---\n\n## Summary\n\n")
                if session_id:
                    md_file.write(f"- **Session:** `{session_id}`\n")
                if usage:
                    md_file.write(f"- **Input tokens:** {usage.get('input_tokens', '?')}\n")
                    md_file.write(f"- **Output tokens:** {usage.get('output_tokens', '?')}\n")
                if cost:
                    md_file.write(f"- **Cost:** ${cost:.4f}\n")
                if duration:
                    md_file.write(f"- **Duration:** {duration / 1000:.1f}s\n")
                md_file.write(f"- **Turns:** {turn_count}\n")
                md_file.write(f"- **Tool calls:** {tool_count}\n")
                md_file.flush()

                print(f"\n\nDone: {turn_count} turns, {tool_count} tool calls, ${cost:.4f}", file=sys.stderr)

            # ── Error ──
            elif event_type == "error":
                error_msg = event.get("error", {}).get("message", str(event))
                md_file.write(f"\n### ❌ Error\n\n```\n{error_msg}\n```\n\n")
                md_file.flush()
                print(f"\n❌ Error: {truncate(error_msg, 100)}", file=sys.stderr)

            # ── System events (retry, etc) ──
            elif event_type == "system":
                subtype = event.get("subtype", "")
                if subtype == "api_retry":
                    md_file.write(f"\n> ⏳ API retry...\n\n")
                    md_file.flush()

    except KeyboardInterrupt:
        md_file.write(f"\n\n---\n\n**Interrupted by user at {datetime.now().strftime('%H:%M:%S')}**\n")
        print("\nInterrupted.", file=sys.stderr)
    except BrokenPipeError:
        pass
    finally:
        md_file.close()


if __name__ == "__main__":
    main()
