#!/usr/bin/env python3
"""
Converts Claude Code JSONL output to a readable markdown transcript.

Reads JSONL line-by-line from stdin (no buffering — writes immediately).
Writes formatted markdown to argv[1].
Optionally saves raw JSONL to argv[2] (replaces tee).
Optionally saves full (untruncated) tool results to argv[3] for debugging.
Prints compact live progress to stderr.

Usage:
  # Main agent (with raw JSONL save + full tool results):
  claude -p "..." --output-format stream-json | python3 -u format-finetune-log.py transcript.md stream.jsonl tool-results.jsonl

  # Main agent (without full tool results):
  claude -p "..." --output-format stream-json | python3 -u format-finetune-log.py transcript.md stream.jsonl

  # Subagent transcript (reformat from file):
  python3 format-finetune-log.py subagent.md < agent-abc123.jsonl
"""

import json
import sys
import os
from datetime import datetime

# Force unbuffered stdout/stderr
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)


def truncate(text: str, max_len: int = 200) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def format_tool_input(tool_name: str, tool_input: dict) -> str:
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
        return "\n".join(f"[{t.get('status','?')}] {t.get('content','')}" for t in todos)
    if tool_name == "Skill":
        return tool_input.get("skill", str(tool_input))
    try:
        return truncate(json.dumps(tool_input, ensure_ascii=False), 300)
    except (TypeError, ValueError):
        return str(tool_input)


def extract_text(content) -> str:
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
    ts = entry.get("timestamp", "")
    if ts:
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            return dt.strftime("%H:%M:%S")
        except (ValueError, TypeError):
            pass
    return datetime.now().strftime("%H:%M:%S")


def process_line(entry: dict, md_file, state: dict, tool_results_file=None):
    """Process a single JSONL entry. State is mutated in place."""
    entry_type = entry.get("type", "")
    message = entry.get("message", {})
    ts = format_timestamp(entry)
    is_subagent = state["is_subagent"]

    if not state["session_id"]:
        state["session_id"] = entry.get("session_id", "")
    if not state["agent_id"]:
        state["agent_id"] = entry.get("agentId") or entry.get("slug", "")

    # ── Track subagent context via parent_tool_use_id ──
    # Entries with parent_tool_use_id matching an Agent tool_use are subagent activity.
    # System/rate_limit events between subagent entries don't have parent_tool_use_id
    # but shouldn't trigger a "returned" transition — only assistant/user entries without it do.
    parent_tool_id = entry.get("parent_tool_use_id", "")
    is_trackable = entry_type in ("assistant", "user")  # only real messages trigger transitions

    if parent_tool_id and parent_tool_id in state.get("active_agents", {}):
        agent_info = state["active_agents"][parent_tool_id]
        if not agent_info.get("header_written"):
            agent_info["header_written"] = True
            desc = agent_info.get("description", "")
            agent_type = agent_info.get("type", "subagent")
            md_file.write(f"\n---\n\n## 🤖 Subagent: {agent_type}\n\n")
            if desc:
                md_file.write(f"> {desc}\n\n")
            md_file.flush()
            print(f"\n🤖 Subagent started: {agent_type}: {desc}", file=sys.stderr)
        state["_in_subagent"] = agent_info.get("type", "subagent")
    elif is_trackable and not parent_tool_id and state.get("_in_subagent"):
        # Real message without parent_tool_id = back to orchestrator
        agent_name = state["_in_subagent"]
        state["_in_subagent"] = ""
        md_file.write(f"\n---\n\n> ✅ **{agent_name}** subagent completed\n\n")
        md_file.flush()
        print(f"\n✅ Subagent completed: {agent_name}", file=sys.stderr)

    # ── System events ──
    if entry_type == "system":
        subtype = entry.get("subtype", "")
        if subtype == "api_retry":
            md_file.write(f"\n> ⏳ API retry at {ts}...\n\n")
            md_file.flush()
        return

    if entry_type == "rate_limit_event":
        md_file.write(f"\n> ⏳ Rate limited at {ts}\n\n")
        md_file.flush()
        return

    # ── Result (final summary) ──
    if entry_type == "result":
        usage = entry.get("usage", {})
        cost = entry.get("cost_usd", 0)
        duration = entry.get("duration_ms", 0)
        md_file.write(f"\n---\n\n## Session Info\n\n")
        if state["session_id"]:
            md_file.write(f"- **Session:** `{state['session_id']}`\n")
        if usage:
            md_file.write(f"- **Input tokens:** {usage.get('input_tokens', '?')}\n")
            md_file.write(f"- **Output tokens:** {usage.get('output_tokens', '?')}\n")
        if cost:
            md_file.write(f"- **Cost:** ${cost:.4f}\n")
        if duration:
            md_file.write(f"- **Duration:** {duration / 1000:.1f}s\n")
        md_file.write(f"- **Turns:** {state['turns']}\n- **Tool calls:** {state['tools']}\n")
        md_file.flush()
        print(f"\n\nDone: {state['turns']} turns, {state['tools']} tool calls"
              + (f", ${cost:.4f}" if cost else ""), file=sys.stderr)
        return

    # ── Error ──
    if entry_type == "error":
        msg = entry.get("error", {}).get("message", str(entry))
        md_file.write(f"\n### ❌ Error — {ts}\n\n```\n{msg}\n```\n\n")
        md_file.flush()
        print(f"\n❌ Error: {truncate(msg, 100)}", file=sys.stderr)
        return

    # ── User message (tool_results or initial prompt) ──
    if entry_type == "user":
        content = message.get("content", [])
        if isinstance(content, str):
            content = [{"type": "text", "text": content}]
        if not isinstance(content, list):
            return

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

                # Save full (untruncated) tool result for debugging
                if tool_results_file and len(text) > 1500:
                    record = {
                        "tool_use_id": block.get("tool_use_id", ""),
                        "is_error": is_error,
                        "content_length": len(text),
                        "content": text,
                        "timestamp": ts,
                    }
                    tool_results_file.write(json.dumps(record, ensure_ascii=False) + "\n")
                    tool_results_file.flush()

            elif block_type == "text" and is_subagent and state["turns"] == 0:
                text = block.get("text", "")
                if text.strip():
                    md_file.write(f"\n## 📨 Task from parent — {ts}\n\n{truncate(text, 2000)}\n")
                    md_file.flush()
        return

    # ── Assistant message (text + tool_use blocks) ──
    if entry_type == "assistant":
        content = message.get("content", [])
        if isinstance(content, str):
            content = [{"type": "text", "text": content}]
        if not isinstance(content, list):
            return

        has_text = False
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type", "")

            if block_type == "text":
                text = block.get("text", "")
                if text.strip():
                    if not has_text:
                        state["turns"] += 1
                        prefix = "Subagent" if is_subagent else "Turn"
                        md_file.write(f"\n## {prefix} {state['turns']} — {ts}\n\n")
                        has_text = True
                    md_file.write(f"{text}\n")
                    md_file.flush()
                    preview = truncate(text.replace("\n", " "), 100)
                    label = f"Sub T{state['turns']}" if is_subagent else f"Turn {state['turns']}"
                    print(f"\r[{label}] {preview}", end="", file=sys.stderr)

            elif block_type == "tool_use":
                state["tools"] += 1
                name = block.get("name", "unknown")
                inp = block.get("input", {})
                formatted = format_tool_input(name, inp)

                # Track Agent spawns so we can label subagent sections
                if name == "Agent":
                    tool_id = block.get("id", "")
                    if tool_id:
                        if "active_agents" not in state:
                            state["active_agents"] = {}
                        state["active_agents"][tool_id] = {
                            "type": inp.get("subagent_type", inp.get("description", "subagent")),
                            "description": inp.get("description", ""),
                            "header_written": False,
                        }

                in_sub = state.get("_in_subagent", "")
                label = f"🔧 {name}" if not in_sub else f"🔧 [{in_sub}] {name}"
                md_file.write(f"\n### {label}\n\n```\n{formatted}\n```\n\n")
                md_file.flush()
                preview = truncate(formatted.replace("\n", " "), 80)
                print(f"\r  {label}: {preview}", end="", file=sys.stderr)

                # Save full tool input for heavy tools (Bash, Write, Edit have large inputs)
                if tool_results_file and name in ("Bash", "Write", "Edit", "Agent"):
                    record = {
                        "tool_use_id": block.get("id", ""),
                        "tool_name": name,
                        "input": inp,
                        "timestamp": ts,
                    }
                    tool_results_file.write(json.dumps(record, ensure_ascii=False) + "\n")
                    tool_results_file.flush()
        return


def main():
    if len(sys.argv) < 2:
        print("Usage: format-finetune-log.py <output.md> [raw.jsonl] [tool-results.jsonl]", file=sys.stderr)
        sys.exit(1)

    md_path = sys.argv[1]
    jsonl_path = sys.argv[2] if len(sys.argv) >= 3 else None
    tool_results_path = sys.argv[3] if len(sys.argv) >= 4 else None

    # Open output files
    md_file = open(md_path, "a", encoding="utf-8", buffering=1)  # line-buffered
    jsonl_file = open(jsonl_path, "a", encoding="utf-8", buffering=1) if jsonl_path else None
    tool_results_file = open(tool_results_path, "a", encoding="utf-8", buffering=1) if tool_results_path else None

    state = {
        "turns": 0,
        "tools": 0,
        "session_id": "",
        "agent_id": "",
        "is_subagent": False,
        "first_line_checked": False,
        "active_agents": {},    # tool_use_id → {type, description, header_written}
        "_in_subagent": "",     # current subagent name, empty if orchestrator
    }

    try:
        # Process line-by-line — no buffering, no read-all
        for line in sys.stdin:
            line = line.rstrip("\n")
            if not line:
                continue

            # Save raw JSONL if requested
            if jsonl_file:
                jsonl_file.write(line + "\n")
                jsonl_file.flush()

            # Parse JSON
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Detect subagent on first line
            if not state["first_line_checked"]:
                state["first_line_checked"] = True
                if "parentUuid" in entry or "agentId" in entry:
                    state["is_subagent"] = True
                    md_file.write(f"\n# Subagent Transcript\n\n")
                    md_file.flush()

            # Process the entry
            process_line(entry, md_file, state, tool_results_file)

    except KeyboardInterrupt:
        md_file.write(f"\n\n---\n\n**⏹ Interrupted at {datetime.now().strftime('%H:%M:%S')}**\n")
        print("\nInterrupted.", file=sys.stderr)
    except BrokenPipeError:
        pass
    finally:
        # End summary for subagents
        if state["is_subagent"]:
            md_file.write(
                f"\n---\n\n**Subagent:** `{state['agent_id'] or 'unknown'}` "
                f"| **Turns:** {state['turns']} | **Tool calls:** {state['tools']}\n"
            )
        md_file.close()
        if jsonl_file:
            jsonl_file.close()
        if tool_results_file:
            tool_results_file.close()


if __name__ == "__main__":
    main()
