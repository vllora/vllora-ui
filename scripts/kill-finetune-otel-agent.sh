#!/usr/bin/env bash
#
# Kill ALL processes from a finetune-otel test run — main agent, orphaned
# Claude subagents, and any training-monitor Python processes.
#
# Sibling to kill-finetune-agent.sh. Differences:
#   - The OTel trace skill has NO Docling polling processes (no document
#     extraction stage), so that section is omitted.
#   - The OTel trace skill has no subagents in v1, but orphaned general-
#     purpose Claude subagents still need cleanup, so that section remains.
#
# Usage:
#   ./scripts/kill-finetune-otel-agent.sh <project-dir>
#   ./scripts/kill-finetune-otel-agent.sh ~/test-samples/otel-phoenix
#
# Safe to run multiple times. Exits 0 even if nothing was found.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project-dir>"
  echo ""
  echo "Example:"
  echo "  $0 ~/Documents/GitHub/test-samples/otel-phoenix"
  exit 1
fi

PROJECT_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
  echo "Error: Directory does not exist: $1"
  exit 1
}

KILLED=0
TOTAL_KILLED=0

echo "Killing all finetune-otel processes for: $(basename "$PROJECT_DIR")"
echo ""

# ─── 1. Kill main agent via stop script (shared with PDF flow) ───────────────

if [[ -f "$SCRIPT_DIR/stop-finetune-agent.sh" ]]; then
  LATEST_PID_FILE=""
  for run_dir in "$PROJECT_DIR"/finetune-runs/run-*/; do
    [[ -f "$run_dir/pid" ]] && LATEST_PID_FILE="$run_dir/pid" && break
  done

  if [[ -n "$LATEST_PID_FILE" ]]; then
    echo "→ Stopping main agent (PID file found)..."
    bash "$SCRIPT_DIR/stop-finetune-agent.sh" "$PROJECT_DIR" 2>/dev/null || true
    echo ""
  fi
fi

# ─── 2. Kill orphaned Claude subagents in the project directory ──────────────

echo "→ Scanning for orphaned claude subagents..."

CLAUDE_PIDS=()

if command -v lsof &>/dev/null; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && CLAUDE_PIDS+=("$pid")
  done < <(lsof -c claude +d "$PROJECT_DIR" 2>/dev/null | awk 'NR>1 {print $2}' | sort -u)

  while IFS= read -r pid; do
    cwd=$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
    if [[ "$cwd" == "$PROJECT_DIR"* ]]; then
      [[ " ${CLAUDE_PIDS[*]:-} " == *" $pid "* ]] || CLAUDE_PIDS+=("$pid")
    fi
  done < <(pgrep -x "claude" 2>/dev/null || true)
fi

if [[ ${#CLAUDE_PIDS[@]} -gt 0 ]]; then
  echo "  Found ${#CLAUDE_PIDS[@]} claude process(es): ${CLAUDE_PIDS[*]}"
  for pid in "${CLAUDE_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "  ✓ Killed claude PID $pid" || true
      KILLED=$((KILLED + 1))
    fi
  done
  sleep 2
  for pid in "${CLAUDE_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null && echo "  ✓ Force-killed claude PID $pid" || true
    fi
  done
  TOTAL_KILLED=$((TOTAL_KILLED + KILLED))
else
  echo "  No orphaned claude subagents found"
fi
echo ""

# ─── 3. Kill training-monitor processes (v1 trace skill doesn't spawn them,
#       but kept for forward-compat if local training gets added later) ──────

echo "→ Scanning for training-monitor processes..."

MONITOR_PIDS=()
while IFS= read -r pid; do
  [[ -n "$pid" ]] && MONITOR_PIDS+=("$pid")
done < <(pgrep -f "training_monitor_" 2>/dev/null || true)

MONITOR_SCRIPTS=()
while IFS= read -r f; do
  [[ -f "$f" ]] && MONITOR_SCRIPTS+=("$f")
done < <(ls /tmp/training_monitor_*.py 2>/dev/null || true)

if [[ ${#MONITOR_PIDS[@]} -gt 0 ]]; then
  echo "  Found ${#MONITOR_PIDS[@]} training-monitor process(es): ${MONITOR_PIDS[*]}"
  for pid in "${MONITOR_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "  ✓ Killed training-monitor PID $pid" || true
      TOTAL_KILLED=$((TOTAL_KILLED + 1))
    fi
  done
else
  echo "  No training-monitor processes found"
fi

if [[ ${#MONITOR_SCRIPTS[@]} -gt 0 ]]; then
  echo "  Cleaning up ${#MONITOR_SCRIPTS[@]} /tmp/training_monitor_* file(s)..."
  rm -f /tmp/training_monitor_*.py /tmp/training_monitor_*.log 2>/dev/null || true
  echo "  ✓ Cleaned /tmp/training_monitor_* files"
fi
echo ""

# ─── 4. Summary ───────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
if [[ $TOTAL_KILLED -gt 0 ]]; then
  echo "  ✅ Killed $TOTAL_KILLED process(es) for $(basename "$PROJECT_DIR")"
else
  echo "  ℹ️  No running processes found for $(basename "$PROJECT_DIR")"
fi
echo "═══════════════════════════════════════════════════════"
