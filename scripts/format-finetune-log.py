#!/usr/bin/env python3
"""
Converts Claude Code JSONL output to a readable markdown transcript.

Handles the unified message format used by both:
  - `claude -p --output-format stream-json` (main agent stream)
  - Subagent conversation transcripts (~/.claude/projects/.../subagents/)

Both formats use: type="assistant"/"user" with message.content[] containing
nested blocks (text, tool_use, tool_result).

Reads JSONL from stdin. Writes formatted markdown to argv[1].
Prints compact live progress to stderr.

Usage:
  claude -p "..." --output-format stream-json | python3 format-finetune-log.py transcript.md
  python3 format-finetune-log.py subagent.md < agent-abc123.jsonl
"""

import json
import sys
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
        return f"{agent_type}: {desc}" if agent_type else desc
    if tool_name == "TodoWrite":
        todos = tool_input.get("todos", [])
        return "\n".join(
            f"[{t.get('status','?')}] {t.get('content','')}" for t in todos
        )
    try:
        return truncate(json.dumps(tool_input, ensure_ascii=False), 300)
    except (TypeError, ValueError):
        return str(tool_input)


def extract_text(content) -> str:
    """Extract plain text from content (string, list of blocks, or dict)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    if isinstance(content, dict) and content.get("type") == "text":
        return content.get("text", "")
    return str(content)


def format_timestamp(entry: dict) -> str:
    """Extract a display timestamp from an entry."""
    ts = entry.get("timestamp", "")
    if ts:
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            return dt.strftime("%H:%M:%S")
        except (ValueError, TypeError):
            pass
    return datetime.now().strftime("%H:%M:%S")


def process(md_file, is_subagent: bool = False):
    """Process JSONL stream (works for both main agent and subagent transcripts)."""
    turn_count = 0
    tool_count = 0
    session_id = ""
    agent_id = ""

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        entry_type = entry.get("type", "")
        message = entry.get("message", {})
        ts = format_timestamp(entry)

        # Track IDs
        if not session_id:
            session_id = entry.get("session_id", "")
        if not agent_id:
            agent_id = entry.get("agentId") or entry.get("slug", "")

        # ── System events (skip most, note retries) ──
        if entry_type == "system":
            subtype = entry.get("subtype", "")
            if subtype == "api_retry":
                md_file.write(f"\n> ⏳ API retry at {ts}...\n\n")
                md_file.flush()
            continue

        if entry_type == "rate_limit_event":
            md_file.write(f"\n> ⏳ Rate limited at {ts}\n\n")
            md_file.flush()
            continue

        # ── Result event (final summary from stream-json) ──
        if entry_type == "result":
            usage = entry.get("usage", {})
            cost = entry.get("cost_usd", 0)
            duration = entry.get("duration_ms", 0)
            md_file.write(f"\n---\n\n## Session Info\n\n")
            if session_id:
                md_file.write(f"- **Session:** `{session_id}`\n")
            if usage:
                md_file.write(f"- **Input tokens:** {usage.get('input_tokens', '?')}\n")
                md_file.write(f"- **Output tokens:** {usage.get('output_tokens', '?')}\n")
            if cost:
                md_file.write(f"- **Cost:** ${cost:.4f}\n")
            if duration:
                md_file.write(f"- **Duration:** {duration / 1000:.1f}s\n")
            md_file.write(f"- **Turns:** {turn_count}\n- **Tool calls:** {tool_count}\n")
            md_file.flush()
            print(f"\n\nDone: {turn_count} turns, {tool_count} tool calls"
                  + (f", ${cost:.4f}" if cost else ""), file=sys.stderr)
            continue

        # ── Error event ──
        if entry_type == "error":
            msg = entry.get("error", {}).get("message", str(entry))
            md_file.write(f"\n### ❌ Error — {ts}\n\n```\n{msg}\n```\n\n")
            md_file.flush()
            print(f"\n❌ Error: {truncate(msg, 100)}", file=sys.stderr)
            continue

        # ── User message (contains tool_results or the initial prompt) ──
        if entry_type == "user":
            content = message.get("content", [])
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            if not isinstance(content, list):
                continue

            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type", "")

                if block_type == "tool_result":
                    result_content = block.get("content", "")
                    text = extract_text(result_content)
                    is_error = block.get("is_error", False)
                    display = truncate(text, 1500)
                    prefix = "❌ Error result" if is_error else "Result"
                    md_file.write(
                        f"<details><summary>{prefix} ({len(text)} chars)</summary>\n\n"
                        f"```\n{display}\n```\n\n</details>\n\n"
                    )
                    md_file.flush()

                elif block_type == "text" and is_subagent:
                    # In subagent transcripts, the first user message is the task
                    text = block.get("text", "")
                    if text.strip() and turn_count == 0:
                        md_file.write(f"\n## 📨 Task from parent — {ts}\n\n{truncate(text, 2000)}\n")
                        md_file.flush()
            continue

        # ── Assistant message (contains text and tool_use blocks) ──
        if entry_type == "assistant":
            content = message.get("content", [])
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            if not isinstance(content, list):
                continue

            has_text = False
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type", "")

                if block_type == "text":
                    text = block.get("text", "")
                    if text.strip():
                        if not has_text:
                            turn_count += 1
                            prefix = "Subagent" if is_subagent else "Turn"
                            md_file.write(f"\n## {prefix} {turn_count} — {ts}\n\n")
                            has_text = True
                        md_file.write(f"{text}\n")
                        md_file.flush()
                        preview = truncate(text.replace("\n", " "), 100)
                        label = f"Sub T{turn_count}" if is_subagent else f"Turn {turn_count}"
                        print(f"\r[{label}] {preview}", end="", file=sys.stderr)

                elif block_type == "tool_use":
                    tool_count += 1
                    name = block.get("name", "unknown")
                    inp = block.get("input", {})
                    formatted = format_tool_input(name, inp)
                    md_file.write(f"\n### 🔧 {name}\n\n```\n{formatted}\n```\n\n")
                    md_file.flush()
                    preview = truncate(formatted.replace("\n", " "), 80)
                    print(f"\r  🔧 {name}: {preview}", end="", file=sys.stderr)

            continue

    # End summary for subagents
    if is_subagent:
        md_file.write(
            f"\n---\n\n**Subagent:** `{agent_id or 'unknown'}` "
            f"| **Turns:** {turn_count} | **Tool calls:** {tool_count}\n"
        )
        md_file.flush()
        print(f"\n  Subagent done: {turn_count} turns, {tool_count} tool calls", file=sys.stderr)


def detect_subagent(first_line: str) -> bool:
    """Detect whether input is a subagent transcript (has parentUuid/agentId)."""
    try:
        data = json.loads(first_line)
        return "parentUuid" in data or "agentId" in data
    except json.JSONDecodeError:
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: format-finetune-log.py <output.md>", file=sys.stderr)
        sys.exit(1)

    md_path = sys.argv[1]

    # Peek at first line to detect format
    first_line = ""
    for line in sys.stdin:
        first_line = line.strip()
        if first_line:
            break

    if not first_line:
        with open(md_path, "a") as f:
            f.write("\n*No output captured.*\n")
        return

    is_subagent = detect_subagent(first_line)

    # Re-inject first line
    import io
    rest = sys.stdin.read()
    sys.stdin = io.StringIO(first_line + "\n" + rest)

    with open(md_path, "a", encoding="utf-8") as md_file:
        if is_subagent:
            md_file.write(f"\n# Subagent Transcript\n\n")
        process(md_file, is_subagent=is_subagent)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
    except BrokenPipeError:
        pass
