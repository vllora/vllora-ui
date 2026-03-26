#!/usr/bin/env bash
#
# Stop a running finetune agent and collect subagent transcripts.
#
# Usage:
#   ./scripts/stop-finetune-agent.sh <project-dir>
#
# What it does:
#   1. Finds the latest run with a PID file
#   2. Kills the agent process
#   3. Collects subagent transcripts from ~/.claude/projects/
#   4. Updates meta.json with final stats

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project-dir>"
  exit 1
fi

PROJECT_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
  echo "Error: Directory does not exist: $1"
  exit 1
}

# Find the latest run directory with a PID file
LATEST_PID_FILE=""
RUN_DIR=""
for run_dir in "$PROJECT_DIR"/finetune-runs/run-*/; do
  if [[ -f "$run_dir/pid" ]]; then
    LATEST_PID_FILE="$run_dir/pid"
    RUN_DIR="$run_dir"
  fi
done

if [[ -z "$LATEST_PID_FILE" || ! -f "$LATEST_PID_FILE" ]]; then
  echo "No running finetune agent found for $(basename "$PROJECT_DIR")"
  exit 1
fi

PID=$(cat "$LATEST_PID_FILE")
RUN_ID=$(basename "$RUN_DIR")
JSONL_FILE="$RUN_DIR/stream.jsonl"
MD_FILE="$RUN_DIR/transcript.md"
META_FILE="$RUN_DIR/meta.json"

# ─── Stop the agent ──────────────────────────────────────────────────────────

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping finetune agent..."
  echo "  Run:  $RUN_ID"
  echo "  PID:  $PID"

  # Kill the process group (pipeline)
  kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true

  # Wait up to 10 seconds
  for i in $(seq 1 10); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done

  # Force kill if still running
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 -- -"$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
  fi

  echo "  ✓ Agent stopped"
else
  echo "Agent (PID $PID) already stopped."
fi

rm -f "$LATEST_PID_FILE"

# Wait for Claude Code to flush subagent files to disk
echo "  Waiting for files to flush..."
sleep 3

# Mark interrupted in transcript
{
  echo ""
  echo "---"
  echo ""
  echo "**⏹ Run stopped at $(date '+%Y-%m-%d %H:%M:%S')**"
} >> "$MD_FILE" 2>/dev/null || true

# ─── Collect subagent transcripts ────────────────────────────────────────────

SESSION_ID=$(grep -o '"session_id":"[^"]*"' "$JSONL_FILE" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "")
SUBAGENT_COUNT=0

if [[ -n "$SESSION_ID" ]]; then
  CLAUDE_PROJECTS="$HOME/.claude/projects"
  SUBAGENT_DIR="$RUN_DIR/subagents"

  while IFS= read -r subagent_file; do
    [[ -f "$subagent_file" ]] || continue
    mkdir -p "$SUBAGENT_DIR"
    agent_name=$(basename "$subagent_file" .jsonl)
    cp "$subagent_file" "$SUBAGENT_DIR/$agent_name.jsonl"

    # Copy meta if exists
    meta="${subagent_file%.jsonl}.meta.json"
    [[ -f "$meta" ]] && cp "$meta" "$SUBAGENT_DIR/$agent_name.meta.json"

    # Convert to markdown
    PYTHONUNBUFFERED=1 python3 -u "$SCRIPT_DIR/format-finetune-log.py" \
      "$SUBAGENT_DIR/$agent_name.md" < "$subagent_file" 2>/dev/null || true

    SUBAGENT_COUNT=$((SUBAGENT_COUNT + 1))
  done < <(find "$CLAUDE_PROJECTS" -path "*/$SESSION_ID/subagents/*.jsonl" 2>/dev/null)
fi

# ─── Write stats ─────────────────────────────────────────────────────────────

TURNS=$(grep -c '"type":"assistant"' "$JSONL_FILE" 2>/dev/null || echo "0")
TOOL_CALLS=$(grep -c '"tool_use"' "$JSONL_FILE" 2>/dev/null || echo "0")

{
  echo ""
  echo "## Run Summary"
  echo ""
  echo "- **Turns:** $TURNS"
  echo "- **Tool calls:** $TOOL_CALLS"
  echo "- **Subagents:** $SUBAGENT_COUNT"
} >> "$MD_FILE" 2>/dev/null || true

if [[ $SUBAGENT_COUNT -gt 0 ]]; then
  {
    echo ""
    echo "### Subagent Transcripts"
    echo ""
    for f in "$SUBAGENT_DIR"/*.md; do
      [[ -f "$f" ]] && echo "- [$(basename "$f")](subagents/$(basename "$f"))"
    done
  } >> "$MD_FILE" 2>/dev/null || true
fi

# Update meta.json
python3 -c "
import json
with open('$META_FILE') as f:
    meta = json.load(f)
meta['finished_at'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
meta['session_id'] = '$SESSION_ID'
meta['exit_code'] = 130
meta['turns'] = $TURNS
meta['tool_calls'] = $TOOL_CALLS
meta['subagent_count'] = $SUBAGENT_COUNT
with open('$META_FILE', 'w') as f:
    json.dump(meta, f, indent=2)
" 2>/dev/null || true

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ⏹ Run stopped: $RUN_ID"
echo ""
echo "  📄 Transcript:  $MD_FILE"
echo "  📊 Raw stream:  $JSONL_FILE"
echo "  📋 Metadata:    $META_FILE"
if [[ $SUBAGENT_COUNT -gt 0 ]]; then
  echo "  🤖 Subagents:   $SUBAGENT_DIR/ ($SUBAGENT_COUNT transcripts)"
else
  echo "  ℹ️  No subagent transcripts found"
fi
echo "═══════════════════════════════════════════════════════"
