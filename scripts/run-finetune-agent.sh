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

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Run:        $RUN_ID"
echo "  Project:    $(basename "$PROJECT_DIR")"
echo "  PDFs:       $PDF_COUNT"
echo "  Max turns:  $MAX_TURNS"
echo "  Gateway:    $GATEWAY_URL"
echo "  Transcript: $MD_FILE"
echo "  Raw JSONL:  $JSONL_FILE"
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

echo "🚀 Starting finetune agent..."
echo ""

# Run claude, tee raw JSONL, pipe to formatter for live markdown.
# Disable errexit for the pipe — we capture exit codes manually.
set +e
"${CLAUDE_CMD[@]}" 2>&1 | tee "$JSONL_FILE" | python3 "$SCRIPT_DIR/format-finetune-log.py" "$MD_FILE"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e

CLAUDE_EXIT=${PIPE_STATUS[0]}
FORMATTER_EXIT=${PIPE_STATUS[2]:-0}

# ─── Finalize ────────────────────────────────────────────────────────────────

# Append footer to markdown
{
  echo ""
  echo "---"
  echo ""
  echo "## Run Summary"
  echo ""
  echo "- **Finished:** $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- **Exit code:** $CLAUDE_EXIT"
} >> "$MD_FILE"

# Count stats from JSONL
if [[ -f "$JSONL_FILE" ]]; then
  TURNS=$(grep -c '"type":"assistant"' "$JSONL_FILE" 2>/dev/null || echo "0")
  TOOL_CALLS=$(grep -c '"tool_use"' "$JSONL_FILE" 2>/dev/null || echo "0")
  ERRORS=$(grep -c '"type":"error"' "$JSONL_FILE" 2>/dev/null || echo "0")
  {
    echo "- **Agent turns:** $TURNS"
    echo "- **Tool calls:** $TOOL_CALLS"
    echo "- **Errors:** $ERRORS"
  } >> "$MD_FILE"
fi

# Update meta.json with results
python3 -c "
import json
with open('$META_FILE') as f:
    meta = json.load(f)
meta['finished_at'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
meta['exit_code'] = $CLAUDE_EXIT
meta['turns'] = ${TURNS:-0}
meta['tool_calls'] = ${TOOL_CALLS:-0}
meta['errors'] = ${ERRORS:-0}
with open('$META_FILE', 'w') as f:
    json.dump(meta, f, indent=2)
" 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════"
if [[ $CLAUDE_EXIT -eq 0 ]]; then
  echo "  ✅ Run complete: $RUN_ID"
else
  echo "  ❌ Run failed (exit $CLAUDE_EXIT): $RUN_ID"
fi
echo "  Transcript: $MD_FILE"
echo "  Raw stream: $JSONL_FILE"
echo "  Metadata:   $META_FILE"
echo "═══════════════════════════════════════════════════════"

exit $CLAUDE_EXIT
