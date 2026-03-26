#!/usr/bin/env python3
"""
Converts Claude Code output to a readable markdown transcript.

Supports TWO input formats:
  1. stream-json (from `claude -p --output-format stream-json`) — streaming events
  2. conversation JSONL (from subagent transcripts at ~/.claude/projects/.../subagents/) — message log

Reads JSONL from stdin. Writes formatted markdown to the file specified as argv[1].
Also prints a compact live progress line to stderr.

Usage:
  # Stream-json from main agent
  claude -p "..." --output-format stream-json | python3 format-finetune-log.py transcript.md

  # Subagent conversation transcript
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
    try:
        return truncate(json.dumps(tool_input, ensure_ascii=False), 300)
    except (TypeError, ValueError):
        return str(tool_input)


def format_tool_result_text(content) -> str:
    """Extract text from tool result content (may be string or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(parts)
    return str(content)


def process_stream_json(md_file):
    """Handle stream-json format from `claude -p --output-format stream-json`."""
    turn_count = 0
    tool_count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        event_type = event.get("type", "")

        if event_type == "assistant":
            turn_count += 1
            content = event.get("message", {}).get("content", [])
            text_parts = [
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
            if text_parts:
                text = "\n".join(text_parts)
                ts = datetime.now().strftime("%H:%M:%S")
                md_file.write(f"\n## Turn {turn_count} — {ts}\n\n{text}\n")
                md_file.flush()
                print(f"\r[Turn {turn_count}] {truncate(text.replace(chr(10), ' '), 100)}", end="", file=sys.stderr)

        elif event_type == "tool_use":
            tool_count += 1
            name = event.get("name", "unknown")
            inp = event.get("input", {})
            formatted = format_tool_input(name, inp)
            md_file.write(f"\n### 🔧 {name}\n\n```\n{formatted}\n```\n\n")
            md_file.flush()
            print(f"\r  🔧 {name}: {truncate(formatted.replace(chr(10), ' '), 80)}", end="", file=sys.stderr)

        elif event_type == "tool_result":
            text = format_tool_result_text(event.get("content", ""))
            display = truncate(text, 1000)
            md_file.write(f"<details><summary>Result ({len(text)} chars)</summary>\n\n```\n{display}\n```\n\n</details>\n\n")
            md_file.flush()

        elif event_type == "result":
            session_id = event.get("session_id", "")
            usage = event.get("usage", {})
            cost = event.get("cost_usd", 0)
            duration = event.get("duration_ms", 0)
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
            print(f"\n\nDone: {turn_count} turns, {tool_count} tool calls, ${cost:.4f}", file=sys.stderr)

        elif event_type == "error":
            msg = event.get("error", {}).get("message", str(event))
            md_file.write(f"\n### ❌ Error\n\n```\n{msg}\n```\n\n")
            md_file.flush()
            print(f"\n❌ Error: {truncate(msg, 100)}", file=sys.stderr)


def process_conversation_jsonl(md_file):
    """Handle conversation JSONL format from subagent transcripts."""
    turn_count = 0
    tool_count = 0
    agent_id = None

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_type = entry.get("type", "")
        message = entry.get("message", {})
        timestamp = entry.get("timestamp", "")

        if not agent_id:
            agent_id = entry.get("agentId") or entry.get("slug")

        # Format timestamp
        ts = ""
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                ts = dt.strftime("%H:%M:%S")
            except (ValueError, TypeError):
                ts = str(timestamp)[:8]

        if msg_type == "user":
            # User message = the task prompt or follow-up from parent
            content = message.get("content", "")
            if isinstance(content, list):
                content = "\n".join(
                    b.get("text", "") for b in content
                    if isinstance(b, dict) and b.get("type") == "text"
                )
            if content:
                md_file.write(f"\n## 📨 Task from parent — {ts}\n\n{truncate(content, 2000)}\n")
                md_file.flush()

        elif msg_type == "assistant":
            turn_count += 1
            content = message.get("content", [])
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]

            for block in content:
                if not isinstance(block, dict):
                    continue

                block_type = block.get("type", "")

                if block_type == "text":
                    text = block.get("text", "")
                    if text.strip():
                        md_file.write(f"\n## Turn {turn_count} — {ts}\n\n{text}\n")
                        md_file.flush()
                        print(f"\r  [Subagent T{turn_count}] {truncate(text.replace(chr(10), ' '), 80)}", end="", file=sys.stderr)

                elif block_type == "tool_use":
                    tool_count += 1
                    name = block.get("name", "unknown")
                    inp = block.get("input", {})
                    formatted = format_tool_input(name, inp)
                    md_file.write(f"\n### 🔧 {name}\n\n```\n{formatted}\n```\n\n")
                    md_file.flush()

                elif block_type == "tool_result":
                    text = format_tool_result_text(block.get("content", ""))
                    display = truncate(text, 1000)
                    md_file.write(f"<details><summary>Result ({len(text)} chars)</summary>\n\n```\n{display}\n```\n\n</details>\n\n")
                    md_file.flush()

    # Summary at end
    md_file.write(f"\n---\n\n**Subagent:** `{agent_id or 'unknown'}` | **Turns:** {turn_count} | **Tool calls:** {tool_count}\n")
    md_file.flush()
    print(f"\n  Subagent done: {turn_count} turns, {tool_count} tool calls", file=sys.stderr)


def detect_format(first_line: str) -> str:
    """Detect whether input is stream-json or conversation JSONL."""
    try:
        data = json.loads(first_line)
        # Conversation JSONL has 'message' with 'role', plus 'parentUuid'
        if "parentUuid" in data or ("message" in data and "role" in data.get("message", {})):
            return "conversation"
        # Stream-json has event types like 'assistant', 'tool_use', 'result'
        return "stream"
    except json.JSONDecodeError:
        return "stream"


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
        # Empty input
        with open(md_path, "a") as f:
            f.write("\n*No output captured.*\n")
        return

    fmt = detect_format(first_line)

    # Re-inject first line by wrapping stdin
    import io
    combined = io.StringIO(first_line + "\n" + sys.stdin.read())
    sys.stdin = combined

    with open(md_path, "a", encoding="utf-8") as md_file:
        if fmt == "conversation":
            md_file.write(f"\n# Subagent Transcript\n\n")
            process_conversation_jsonl(md_file)
        else:
            process_stream_json(md_file)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
    except BrokenPipeError:
        pass
