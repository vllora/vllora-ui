#!/usr/bin/env bash
#
# Run the finetune agent on a target project and capture full logs.
#
# Usage:
#   ./scripts/run-finetune-agent.sh <project-dir> [prompt]
#   ./scripts/run-finetune-agent.sh ~/test-samples/contract-translator
#   ./scripts/run-finetune-agent.sh ~/test-samples/contract-translator "Fine-tune a contract translator..."
#
# What it does:
#   1. Syncs the latest skill + agents to the project
#   2. Checks gateway is running at localhost:9090
#   3. Runs Claude Code in non-interactive mode with the prompt
#   4. Captures raw JSONL stream → <project-dir>/finetune-runs/<run-id>/stream.jsonl
#   5. Converts to readable markdown → <project-dir>/finetune-runs/<run-id>/transcript.md
#   6. Shows live progress in terminal
#
# The raw JSONL contains every event (messages, tool calls, tool results, usage).
# The markdown is a human-readable transcript for analysis.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Args ────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  cat <<'USAGE'
Usage: run-finetune-agent.sh <project-dir> [prompt]

If prompt is omitted, reads from <project-dir>/finetune-prompt.md

Examples:
  ./scripts/run-finetune-agent.sh ~/test-samples/contract-translator
  ./scripts/run-finetune-agent.sh ~/test-samples/contract-translator "Fine-tune a model..."

Environment variables:
  GATEWAY_URL    Gateway URL (default: http://localhost:9090)
  MAX_TURNS      Max agent turns (default: 200)
  CLAUDE_MODEL   Model to use (default: system default)
USAGE
  exit 1
fi

PROJECT_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
  echo "Error: Directory does not exist: $1"
  exit 1
}
shift

GATEWAY_URL="${GATEWAY_URL:-http://localhost:9090}"
MAX_TURNS="${MAX_TURNS:-200}"

# ─── Resolve prompt ──────────────────────────────────────────────────────────

if [[ $# -ge 1 ]]; then
  PROMPT="$1"
elif [[ -f "$PROJECT_DIR/finetune-prompt.md" ]]; then
  PROMPT="$(cat "$PROJECT_DIR/finetune-prompt.md")"
  echo "📄 Using prompt from $PROJECT_DIR/finetune-prompt.md"
else
  echo "Error: No prompt provided and no finetune-prompt.md found in $PROJECT_DIR"
  echo "Either pass a prompt as the second argument or create finetune-prompt.md"
  exit 1
fi

# ─── Pre-flight checks ──────────────────────────────────────────────────────

# Check claude is installed
if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' command not found. Install Claude Code first."
  exit 1
fi

# Check gateway
echo "🔍 Checking gateway at $GATEWAY_URL..."
if curl -s --connect-timeout 3 "$GATEWAY_URL/health" >/dev/null 2>&1; then
  echo "   ✓ Gateway is running"
else
  echo "   ⚠ Gateway not reachable at $GATEWAY_URL"
  echo "   Start it with: npm run start:backend (from gateway repo)"
  echo ""
  read -r -p "Continue anyway? [y/N] " response
  [[ "$response" =~ ^[Yy]$ ]] || exit 1
fi

# Check PDFs exist
PDF_COUNT=$(find "$PROJECT_DIR/pdfs" -name "*.pdf" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$PDF_COUNT" -gt 0 ]]; then
  echo "   ✓ Found $PDF_COUNT PDF(s) in pdfs/"
else
  echo "   ⚠ No PDFs found in $PROJECT_DIR/pdfs/"
fi

# ─── Sync skill + agents ────────────────────────────────────────────────────

echo ""
echo "📦 Syncing skill + agents..."
"$SCRIPT_DIR/sync-finetune-skill.sh" "$PROJECT_DIR"

# ─── Prepare run directory ───────────────────────────────────────────────────

RUN_ID="run-$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$PROJECT_DIR/finetune-runs/$RUN_ID"
mkdir -p "$RUN_DIR"

JSONL_FILE="$RUN_DIR/stream.jsonl"
MD_FILE="$RUN_DIR/transcript.md"
META_FILE="$RUN_DIR/meta.json"

# Save full prompt
cp "$PROJECT_DIR/finetune-prompt.md" "$RUN_DIR/prompt.md" 2>/dev/null || echo "$PROMPT" > "$RUN_DIR/prompt.md"

# Save metadata (use python for safe JSON encoding)
python3 -c "
import json, sys
meta = {
    'run_id': '$RUN_ID',
    'project_dir': '$PROJECT_DIR',
    'gateway_url': '$GATEWAY_URL',
    'max_turns': $MAX_TURNS,
    'pdf_count': $PDF_COUNT,
    'started_at': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
}
with open('$META_FILE', 'w') as f:
    json.dump(meta, f, indent=2)
"

# Save PID file so the run can be stopped externally
PID_FILE="$RUN_DIR/pid"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Run:        $RUN_ID"
echo "  Project:    $(basename "$PROJECT_DIR")"
echo "  PDFs:       $PDF_COUNT"
echo "  Max turns:  $MAX_TURNS"
echo "  Gateway:    $GATEWAY_URL"
echo "  Transcript: $MD_FILE"
echo "  Raw JSONL:  $JSONL_FILE"
echo ""
echo "  To stop:    kill \$(cat $PID_FILE)"
echo "       or:    ./scripts/stop-finetune-agent.sh $PROJECT_DIR"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Write markdown header ───────────────────────────────────────────────────

cat > "$MD_FILE" << HEADER
# Finetune Run: $RUN_ID

- **Project:** $(basename "$PROJECT_DIR")
- **Started:** $(date '+%Y-%m-%d %H:%M:%S')
- **PDFs:** $PDF_COUNT documents
- **Gateway:** $GATEWAY_URL
- **Max turns:** $MAX_TURNS

## Prompt

$(head -5 "$RUN_DIR/prompt.md")
...

---

HEADER

# ─── Run Claude Code ─────────────────────────────────────────────────────────

# Build claude command
CLAUDE_CMD=(
  claude
  -p "$PROMPT"
  --output-format stream-json
  --verbose
  --dangerously-skip-permissions
  --max-turns "$MAX_TURNS"
)

# Add model override if set
if [[ -n "${CLAUDE_MODEL:-}" ]]; then
  CLAUDE_CMD+=(--model "$CLAUDE_MODEL")
fi

cd "$PROJECT_DIR"

# ─── Finalize function (called on both normal exit and interrupt) ─────────────

FINALIZED=false

finalize() {
  # Guard against double-finalize
  [[ "$FINALIZED" == "true" ]] && return
  FINALIZED=true

  local exit_code="${1:-999}"

  # Remove PID file
  rm -f "$PID_FILE"

  # Append footer to markdown
  {
    echo ""
    echo "---"
    echo ""
    echo "## Run Summary"
    echo ""
    echo "- **Finished:** $(date '+%Y-%m-%d %H:%M:%S')"
    echo "- **Exit code:** $exit_code"
  } >> "$MD_FILE" 2>/dev/null || true

  # Count stats from JSONL
  local turns=0 tool_calls=0 errors=0
  if [[ -f "$JSONL_FILE" ]]; then
    turns=$(grep -c '"type":"assistant"' "$JSONL_FILE" 2>/dev/null || echo "0")
    tool_calls=$(grep -c '"tool_use"' "$JSONL_FILE" 2>/dev/null || echo "0")
    errors=$(grep -c '"type":"error"' "$JSONL_FILE" 2>/dev/null || echo "0")
    {
      echo "- **Agent turns:** $turns"
      echo "- **Tool calls:** $tool_calls"
      echo "- **Errors:** $errors"
    } >> "$MD_FILE" 2>/dev/null || true
  fi

  # Collect subagent transcripts
  local session_id subagent_count=0
  session_id=$(grep -o '"session_id":"[^"]*"' "$JSONL_FILE" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "")

  if [[ -n "$session_id" ]]; then
    local claude_projects="$HOME/.claude/projects"
    local subagent_dir="$RUN_DIR/subagents"

    while IFS= read -r subagent_file; do
      [[ -f "$subagent_file" ]] || continue
      mkdir -p "$subagent_dir"
      local agent_name
      agent_name=$(basename "$subagent_file" .jsonl)
      cp "$subagent_file" "$subagent_dir/$agent_name.jsonl"

      # Also copy meta.json if it exists
      local meta_file="${subagent_file%.jsonl}.meta.json"
      [[ -f "$meta_file" ]] && cp "$meta_file" "$subagent_dir/$agent_name.meta.json"

      # Convert to markdown
      PYTHONUNBUFFERED=1 python3 -u "$SCRIPT_DIR/format-finetune-log.py" "$subagent_dir/$agent_name.md" < "$subagent_file" 2>/dev/null || true

      subagent_count=$((subagent_count + 1))
    done < <(find "$claude_projects" -path "*/$session_id/subagents/*.jsonl" 2>/dev/null)
  fi

  if [[ $subagent_count -gt 0 ]]; then
    echo "  📋 Collected $subagent_count subagent transcript(s)"
    {
      echo "- **Subagents:** $subagent_count transcripts collected"
      echo ""
      echo "### Subagent Transcripts"
      echo ""
      for f in "$RUN_DIR/subagents"/*.md; do
        [[ -f "$f" ]] && echo "- [$(basename "$f")](subagents/$(basename "$f"))"
      done
    } >> "$MD_FILE" 2>/dev/null || true
  else
    echo "  ℹ️  No subagent transcripts found (session: ${session_id:-unknown})"
  fi

  # Update meta.json
  python3 -c "
import json
with open('$META_FILE') as f:
    meta = json.load(f)
meta['finished_at'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
meta['session_id'] = '$session_id'
meta['exit_code'] = $exit_code
meta['turns'] = $turns
meta['tool_calls'] = $tool_calls
meta['errors'] = $errors
meta['subagent_count'] = $subagent_count
with open('$META_FILE', 'w') as f:
    json.dump(meta, f, indent=2)
" 2>/dev/null || true
}

# ─── Signal handling ─────────────────────────────────────────────────────────

CLAUDE_PID=""

cleanup() {
  echo ""
  echo "⏹  Stopping finetune agent..."

  # Kill the claude process if still running
  if [[ -n "$CLAUDE_PID" ]] && kill -0 "$CLAUDE_PID" 2>/dev/null; then
    kill "$CLAUDE_PID" 2>/dev/null
    wait "$CLAUDE_PID" 2>/dev/null || true
  fi

  # Run finalize (collects subagents, writes summary)
  finalize "130"

  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  ⏹ Run interrupted: $(basename "$RUN_DIR")"
  echo "  📄 Transcript:  $MD_FILE"
  echo "  📊 Raw stream:  $JSONL_FILE"
  [[ -d "$RUN_DIR/subagents" ]] && echo "  🤖 Subagents:   $RUN_DIR/subagents/"
  echo "═══════════════════════════════════════════════════════"

  exit 130
}

trap cleanup INT TERM

# ─── Launch ──────────────────────────────────────────────────────────────────

echo "🚀 Starting finetune agent..."
echo ""

# Run claude and pipe directly to the formatter (which also saves raw JSONL).
# No tee — the formatter handles both writing the raw stream and the markdown.
# This avoids pipe buffering issues (tee + python3 in a pipeline buffers on macOS).
set +e
"${CLAUDE_CMD[@]}" 2>&1 | PYTHONUNBUFFERED=1 python3 -u "$SCRIPT_DIR/format-finetune-log.py" "$MD_FILE" "$JSONL_FILE" &
PIPE_PID=$!

# The pipeline runs as a single process group. Save the group PID.
echo "$PIPE_PID" > "$PID_FILE"
# Also try to find the actual claude PID (first process in pipe)
CLAUDE_PID=$(jobs -p 2>/dev/null | head -1 || echo "$PIPE_PID")

wait "$PIPE_PID" 2>/dev/null
CLAUDE_EXIT=$?
set -e

# ─── Finalize (collect subagents, write summary, update meta) ────────────────

finalize "$CLAUDE_EXIT"

echo ""
echo "═══════════════════════════════════════════════════════"
if [[ $CLAUDE_EXIT -eq 0 ]]; then
  echo "  ✅ Run complete: $RUN_ID"
else
  echo "  ❌ Run failed (exit $CLAUDE_EXIT): $RUN_ID"
fi
echo ""
echo "  📄 Transcript:  $MD_FILE"
echo "  📊 Raw stream:  $JSONL_FILE"
echo "  📋 Metadata:    $META_FILE"
[[ -d "$RUN_DIR/subagents" ]] && echo "  🤖 Subagents:   $RUN_DIR/subagents/"
echo "═══════════════════════════════════════════════════════"

exit $CLAUDE_EXIT
