# Finetune Skill Run Infrastructure

How the test harness launches skill runs, captures logs, and formats transcripts for debugging.

## Overview

```
run-finetune-agent.sh          format-finetune-log.py
  ├── Syncs skill + agents       ├── Reads JSONL stream from stdin
  ├── Pre-flight checks          ├── Writes raw JSONL to stream.jsonl
  ├── Launches claude CLI        ├── Writes formatted transcript.md
  ├── Pipes output to formatter  ├── Prints live progress to stderr
  └── Collects subagent logs     └── Handles subagent sections
```

## Quick Start

```bash
# Run against a test project
./scripts/run-finetune-agent.sh ~/test-samples/tax-deduction-analyzer

# With custom prompt (overrides finetune-prompt.md)
./scripts/run-finetune-agent.sh ~/test-samples/tax-deduction-analyzer "Fine-tune a tax expert..."

# With environment overrides
GATEWAY_URL=http://localhost:9090 MAX_TURNS=50 CLAUDE_MODEL=sonnet \
  ./scripts/run-finetune-agent.sh ~/test-samples/tax-deduction-analyzer
```

## What Happens During a Run

### 1. Skill + Agent Sync

The script calls `scripts/sync-finetune-skill.sh` which copies from the repo to the project:

| Source (repo) | Destination (project) |
|---------------|----------------------|
| `finetune-skill/` | `<project>/.claude/skills/finetune/` |
| `agents/knowledge-extractor.md` | `<project>/.claude/agents/knowledge-extractor.md` |
| `agents/relation-builder.md` | `<project>/.claude/agents/relation-builder.md` |
| `agents/training-monitor.md` | `<project>/.claude/agents/training-monitor.md` |

This ensures the project always runs the latest skill version.

### 2. Pre-flight Checks

- **Gateway reachable** at `$GATEWAY_URL/health` (default: `localhost:9090`)
- **Claude CLI** installed
- **PDFs exist** in `<project>/pdfs/`

### 3. Run Directory Structure

Each run creates a timestamped directory:

```
<project>/finetune-runs/
└── run-20260326-220500/
    ├── prompt.md            # Copy of the prompt used
    ├── meta.json            # Run metadata (timing, counts, exit code)
    ├── stream.jsonl         # Raw Claude Code JSONL stream (every event)
    ├── transcript.md        # Human-readable formatted transcript
    ├── pid                  # PID file (for stopping the run)
    └── subagents/           # Collected subagent transcripts
        ├── agent-abc123.jsonl
        ├── agent-abc123.md
        └── ...
```

### 4. Claude CLI Invocation

```bash
claude -p "$PROMPT" \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --max-turns $MAX_TURNS
```

The `--output-format stream-json` flag outputs one JSONL event per line, which is piped directly to `format-finetune-log.py`.

### 5. Subagent Collection

After the main agent finishes, the script:
1. Extracts the `session_id` from the JSONL stream
2. Finds subagent JSONL files in `~/.claude/projects/*/<session_id>/subagents/`
3. Copies them to `<run-dir>/subagents/`
4. Converts each to markdown using `format-finetune-log.py`

## format-finetune-log.py — The Log Formatter

### What It Does

Reads Claude Code's JSONL stream line-by-line and produces three outputs simultaneously:

| Output | Where | Purpose |
|--------|-------|---------|
| Raw JSONL | `stream.jsonl` (argv[2]) | Complete event log for programmatic analysis |
| Markdown | `transcript.md` (argv[1]) | Human-readable transcript for debugging |
| Live progress | stderr | Real-time terminal feedback during the run |

### JSONL Event Types

The Claude Code stream contains these event types:

| Event Type | What It Contains | How It's Formatted |
|------------|-----------------|-------------------|
| `system` | System events (API retries) | `> ⏳ API retry at HH:MM:SS` |
| `assistant` | Agent's text + tool_use blocks | `## Turn N — HH:MM:SS` + text + tool blocks |
| `user` | Tool results + initial prompt | `<details>` collapsed result blocks |
| `result` | Final summary (tokens, cost, duration) | `## Session Info` with stats |
| `error` | Error messages | `### ❌ Error` with stack trace |
| `rate_limit_event` | Rate limiting | `> ⏳ Rate limited` |

### Tool Call Formatting

Each tool call is formatted based on its type for readability:

| Tool | What's Shown |
|------|-------------|
| `Bash` | The command string |
| `Read` / `Write` / `Edit` | The file path |
| `Grep` | `pattern="..." path="..."` |
| `Agent` | `subagent_type: description` |
| `TodoWrite` | Status + content for each todo item |
| `Skill` | The skill name |
| Others | Truncated JSON input (300 chars) |

### Subagent Tracking

The formatter tracks subagent activity by matching `parent_tool_use_id` fields:

1. When an `Agent` tool_use block appears, its `id` is stored
2. Subsequent events with `parent_tool_use_id` matching that ID are labeled as subagent activity
3. When events without `parent_tool_use_id` appear again, a "subagent completed" marker is written
4. This creates clear visual sections in the transcript:

```markdown
---
## 🤖 Subagent: knowledge-extractor
> Extract and chunk PDF documents using Docling

### 🔧 [knowledge-extractor] Bash
curl -X POST http://localhost:5001/v1/convert ...

---
> ✅ **knowledge-extractor** subagent completed
```

### Standalone Usage

The formatter can also convert existing JSONL files (e.g., subagent logs):

```bash
# Convert a subagent JSONL to markdown
python3 scripts/format-finetune-log.py output.md < subagent.jsonl
```

When reading from a file (no argv[2]), it skips the raw JSONL saving step.

## Reading Transcripts — What to Look For

### Healthy Run Indicators

- **Turn count** increases steadily (not stuck in loops)
- **Tool calls** are diverse (Bash, Read, Write, Grep — not just one tool repeatedly)
- **Subagents** start and complete without errors
- **No rate limiting** or API retry events
- **Exit code 0** in the run summary

### Common Issues

| Symptom in Transcript | Likely Cause | Fix |
|----------------------|-------------|-----|
| Repeated `Bash: curl ... 404 Not Found` | Docling server restarted, task IDs expired | Restart the run (task IDs are in-memory) |
| `⏳ Rate limited` appearing frequently | Hitting Claude API rate limits | Reduce `MAX_TURNS` or wait |
| Subagent starts but never completes | Subagent hit max turns or errored | Check subagent transcript in `subagents/` |
| `❌ Error: overloaded` | Claude API overloaded | Wait and retry |
| Same tool call repeated 5+ times | Agent stuck in a retry loop | Check if the tool's precondition is met |
| Turn count hits `MAX_TURNS` with no result | Task too complex for turn budget | Increase `MAX_TURNS` or simplify prompt |

### Analyzing a Run Programmatically

The raw `stream.jsonl` can be queried with standard tools:

```bash
# Count turns and tool calls
grep -c '"type":"assistant"' stream.jsonl    # turns
grep -c '"tool_use"' stream.jsonl            # tool calls

# Find all errors
grep '"type":"error"' stream.jsonl | python3 -m json.tool

# List all tool names used
grep -o '"name":"[^"]*"' stream.jsonl | sort | uniq -c | sort -rn

# Find all Bash commands
grep '"tool_use"' stream.jsonl | python3 -c "
import json, sys
for line in sys.stdin:
    entry = json.loads(line)
    for block in entry.get('message', {}).get('content', []):
        if block.get('type') == 'tool_use' and block.get('name') == 'Bash':
            print(block['input'].get('command', ''))
"

# Get cost and token usage
grep '"type":"result"' stream.jsonl | python3 -m json.tool
```

### meta.json Fields

After a run completes, `meta.json` contains:

```json
{
  "run_id": "run-20260326-220500",
  "project_dir": "/Users/.../tax-deduction-analyzer",
  "gateway_url": "http://localhost:9090",
  "max_turns": 200,
  "pdf_count": 6,
  "started_at": "2026-03-26T22:05:00Z",
  "finished_at": "2026-03-26T23:15:00Z",
  "session_id": "abc-123-def",
  "exit_code": 0,
  "turns": 47,
  "tool_calls": 182,
  "errors": 0,
  "subagent_count": 3
}
```

## Stopping a Run

```bash
# Option 1: Use the stop script
./scripts/stop-finetune-agent.sh ~/test-samples/tax-deduction-analyzer

# Option 2: Kill by PID
kill $(cat ~/test-samples/tax-deduction-analyzer/finetune-runs/run-*/pid)

# Option 3: Ctrl+C in the terminal running the script
# (triggers cleanup: collects subagents, writes summary)
```

All three methods trigger the `finalize()` function which collects subagent transcripts and writes the run summary.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GATEWAY_URL` | `http://localhost:9090` | vLLora gateway URL |
| `MAX_TURNS` | `200` | Maximum agent turns before stopping |
| `CLAUDE_MODEL` | (system default) | Override the Claude model used |
