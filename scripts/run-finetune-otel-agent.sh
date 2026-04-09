#!/usr/bin/env bash
#
# Run the OTel trace finetune agent on a target project and capture full logs.
#
# Sibling to run-finetune-agent.sh. Differences:
#   - Syncs finetune-skill-otel/ instead of finetune-skill/
#   - Counts OTel trace inputs (parquet / semconv JSON) instead of PDFs
#   - No PDF-specific pre-flight checks
#
# The rest of the harness (JSONL stream, FIFO, finalize, signal handling,
# subagent collection, analyze step) is identical to the PDF runner — the
# OTel trace skill uses the same Claude Code transcript format.
#
# Usage:
#   ./scripts/run-finetune-otel-agent.sh <project-dir> [prompt]
#   ./scripts/run-finetune-otel-agent.sh ~/test-samples/otel-phoenix
#
# Environment variables:
#   GATEWAY_URL    Gateway URL (default: http://localhost:9090)
#   MAX_TURNS      Max agent turns (default: 200)
#   CLAUDE_MODEL   Model to use (default: system default)
#   BATCH_MODE     If "true", skip interactive prompts on gateway check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Args ────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  cat <<'USAGE'
Usage: run-finetune-otel-agent.sh <project-dir> [prompt]

If prompt is omitted, reads from <project-dir>/finetune-prompt.md

Examples:
  ./scripts/run-finetune-otel-agent.sh ~/test-samples/otel-phoenix
  ./scripts/run-finetune-otel-agent.sh ~/test-samples/otel-phoenix "Fine-tune a tool router..."

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

if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' command not found. Install Claude Code first."
  exit 1
fi

echo "🔍 Checking gateway at $GATEWAY_URL..."
if curl -s --connect-timeout 3 "$GATEWAY_URL/health" >/dev/null 2>&1; then
  echo "   ✓ Gateway is running"
else
  echo "   ⚠ Gateway not reachable at $GATEWAY_URL"
  echo "   Start it with: npm run start:backend (from gateway repo)"
  if [[ "${BATCH_MODE:-}" == "true" ]]; then
    echo "   BATCH_MODE=true — skipping prompt, continuing..."
  else
    echo ""
    read -r -p "Continue anyway? [y/N] " response
    [[ "$response" =~ ^[Yy]$ ]] || exit 1
  fi
fi

# Count OTel trace input files. Recognize both the raw Phoenix parquet and
# the pre-converted semconv JSON form — either is a valid Stage-1 input.
TRACE_COUNT=0
for candidate in \
  "$PROJECT_DIR"/source_traces*.parquet \
  "$PROJECT_DIR"/source_traces*.json \
  "$PROJECT_DIR"/traces/*.parquet \
  "$PROJECT_DIR"/traces/*.json; do
  [[ -f "$candidate" ]] && TRACE_COUNT=$((TRACE_COUNT + 1))
done

if [[ "$TRACE_COUNT" -gt 0 ]]; then
  echo "   ✓ Found $TRACE_COUNT OTel trace file(s)"
else
  echo "   ⚠ No OTel trace files found (looked for source_traces*.parquet/.json and traces/*)"
fi

# ─── Sync skill ─────────────────────────────────────────────────────────────

echo ""
echo "📦 Syncing finetune-skill-otel..."
"$SCRIPT_DIR/sync-finetune-otel-skill.sh" "$PROJECT_DIR"

# ─── Prepare run directory ───────────────────────────────────────────────────

RUN_ID="run-$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$PROJECT_DIR/finetune-runs/$RUN_ID"
mkdir -p "$RUN_DIR"

JSONL_FILE="$RUN_DIR/stream.jsonl"
MD_FILE="$RUN_DIR/transcript.md"
META_FILE="$RUN_DIR/meta.json"
TOOL_RESULTS_FILE="$RUN_DIR/tool-results.jsonl"

cp "$PROJECT_DIR/finetune-prompt.md" "$RUN_DIR/prompt.md" 2>/dev/null || echo "$PROMPT" > "$RUN_DIR/prompt.md"

# meta.json — reuse the _write-meta helper; record the trace count under the
# same `--pdf-count` flag so the analyze step keeps working. Rename the
# concept in docs, not in the meta-writer (too much churn).
python3 "$SCRIPT_DIR/_write-meta.py" "$META_FILE" create \
  --run-id "$RUN_ID" \
  --project-dir "$PROJECT_DIR" \
  --gateway-url "$GATEWAY_URL" \
  --max-turns "$MAX_TURNS" \
  --pdf-count "$TRACE_COUNT"

PID_FILE="$RUN_DIR/pid"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Run:        $RUN_ID"
echo "  Project:    $(basename "$PROJECT_DIR")"
echo "  Skill:      finetune-skill-otel (OTel trace pipeline)"
echo "  Traces:     $TRACE_COUNT"
echo "  Max turns:  $MAX_TURNS"
echo "  Gateway:    $GATEWAY_URL"
echo "  Transcript: $MD_FILE"
echo "  Raw JSONL:  $JSONL_FILE"
echo ""
echo "  To stop:    kill \$(cat $PID_FILE)"
echo "       or:    ./scripts/kill-finetune-otel-agent.sh $PROJECT_DIR"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Write markdown header ───────────────────────────────────────────────────

cat > "$MD_FILE" << HEADER
# Finetune-OTel Run: $RUN_ID

- **Project:** $(basename "$PROJECT_DIR")
- **Skill:** finetune-skill-otel (OTel trace pipeline)
- **Started:** $(date '+%Y-%m-%d %H:%M:%S')
- **Trace files:** $TRACE_COUNT
- **Gateway:** $GATEWAY_URL
- **Max turns:** $MAX_TURNS

## Prompt

$(head -5 "$RUN_DIR/prompt.md")
...

---

HEADER

# ─── Run Claude Code ─────────────────────────────────────────────────────────

CLAUDE_CMD=(
  claude
  -p "$PROMPT"
  --output-format stream-json
  --verbose
  --dangerously-skip-permissions
  --max-turns "$MAX_TURNS"
)

if [[ -n "${CLAUDE_MODEL:-}" ]]; then
  CLAUDE_CMD+=(--model "$CLAUDE_MODEL")
fi

cd "$PROJECT_DIR"

# ─── Finalize function ───────────────────────────────────────────────────────

FINALIZED=false

finalize() {
  [[ "$FINALIZED" == "true" ]] && return
  FINALIZED=true

  local exit_code="${1:-999}"
  rm -f "$PID_FILE"

  {
    echo ""
    echo "---"
    echo ""
    echo "## Run Summary"
    echo ""
    echo "- **Finished:** $(date '+%Y-%m-%d %H:%M:%S')"
    echo "- **Exit code:** $exit_code"
  } >> "$MD_FILE" 2>/dev/null || true

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

  # Subagent collection — trace skill has no subagents in v1, but the
  # orchestrator can still invoke general-purpose agents, so keep the
  # collection step in case the user adds some later.
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
      local meta_file="${subagent_file%.jsonl}.meta.json"
      [[ -f "$meta_file" ]] && cp "$meta_file" "$subagent_dir/$agent_name.meta.json"
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
  fi

  python3 "$SCRIPT_DIR/_write-meta.py" "$META_FILE" finalize \
    --session-id "${session_id:-}" \
    --exit-code "$exit_code" \
    --turns "$turns" \
    --tool-calls "$tool_calls" \
    --errors "$errors" \
    --subagent-count "$subagent_count" 2>/dev/null || true
}

# ─── Signal handling ─────────────────────────────────────────────────────────

CLAUDE_PID=""
FORMATTER_PID=""
FIFO_PATH="$RUN_DIR/stream.fifo"

cleanup() {
  echo ""
  echo "⏹  Stopping finetune-otel agent..."

  if [[ -n "$CLAUDE_PID" ]] && kill -0 "$CLAUDE_PID" 2>/dev/null; then
    kill "$CLAUDE_PID" 2>/dev/null
    wait "$CLAUDE_PID" 2>/dev/null || true
  fi

  if [[ -n "$FORMATTER_PID" ]] && kill -0 "$FORMATTER_PID" 2>/dev/null; then
    wait "$FORMATTER_PID" 2>/dev/null || true
  fi

  rm -f "$FIFO_PATH"
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

echo "🚀 Starting finetune-otel agent..."
echo ""

mkfifo "$FIFO_PATH"

PYTHONUNBUFFERED=1 python3 -u "$SCRIPT_DIR/format-finetune-log.py" "$MD_FILE" "$JSONL_FILE" "$TOOL_RESULTS_FILE" < "$FIFO_PATH" &
FORMATTER_PID=$!

"${CLAUDE_CMD[@]}" > "$FIFO_PATH" 2>&1 &
CLAUDE_PID=$!
echo "$CLAUDE_PID" > "$PID_FILE"

set +e
wait "$CLAUDE_PID"
CLAUDE_EXIT=$?
set -e
CLAUDE_PID=""

wait "$FORMATTER_PID" 2>/dev/null || true
FORMATTER_PID=""

rm -f "$FIFO_PATH"

finalize "$CLAUDE_EXIT"

# ─── Automated analysis ─────────────────────────────────────────────────────

# The PDF skill's analyze-finetune-run.py is PDF-specific. For the trace
# skill, v1 just surfaces the transcript and lets the user inspect
# manually. If/when an OTel-specific analyzer lands, invoke it here.
echo ""

echo "═══════════════════════════════════════════════════════"
if [[ $CLAUDE_EXIT -eq 0 ]]; then
  echo "  ✅ Run complete: $RUN_ID"
else
  echo "  ❌ Run failed (exit $CLAUDE_EXIT): $RUN_ID"
fi
echo ""
echo "  📄 Transcript:    $MD_FILE"
echo "  📊 Raw stream:    $JSONL_FILE"
echo "  📋 Metadata:      $META_FILE"
[[ -s "$TOOL_RESULTS_FILE" ]] && echo "  🔧 Tool results:  $TOOL_RESULTS_FILE"
[[ -d "$RUN_DIR/subagents" ]] && echo "  🤖 Subagents:     $RUN_DIR/subagents/"
echo "═══════════════════════════════════════════════════════"

exit $CLAUDE_EXIT
