#!/usr/bin/env bash
#
# Kill ALL processes from a finetune test run — main agent, subagents, and
# background training-monitor Python processes.
#
# The normal stop-finetune-agent.sh only kills the main process group.
# This script goes further: it finds every claude subagent running in the
# project directory and every training_monitor_*.py Python process.
#
# Usage:
#   ./scripts/kill-finetune-agent.sh <project-dir>
#   ./scripts/kill-finetune-agent.sh ~/test-samples/food-label-compliance
#
# Safe to run multiple times. Exits 0 even if nothing was found.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project-dir>"
  echo ""
  echo "Example:"
  echo "  $0 ~/Documents/GitHub/test-samples/food-label-compliance"
  exit 1
fi

PROJECT_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
  echo "Error: Directory does not exist: $1"
  exit 1
}

KILLED=0
TOTAL_KILLED=0

echo "Killing all finetune processes for: $(basename "$PROJECT_DIR")"
echo ""

# ─── 1. Kill main agent via stop script (handles PID file + transcript) ──────

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

# ─── 2. Kill orphaned claude subagents in the project directory ──────────────

echo "→ Scanning for orphaned claude subagents..."

CLAUDE_PIDS=()

# Method A: lsof — find claude processes with project dir open (most reliable)
if command -v lsof &>/dev/null; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && CLAUDE_PIDS+=("$pid")
  done < <(lsof -c claude +d "$PROJECT_DIR" 2>/dev/null | awk 'NR>1 {print $2}' | sort -u)
fi

# Method B: ps + check cwd via lsof — catches subagents that have moved dirs
if command -v lsof &>/dev/null; then
  while IFS= read -r pid; do
    cwd=$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
    if [[ "$cwd" == "$PROJECT_DIR"* ]]; then
      # Avoid duplicates
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
  # Give them a moment to exit cleanly
  sleep 2
  # Force kill any that are still alive
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

# ─── 3. Kill training-monitor Python processes ───────────────────────────────

echo "→ Scanning for training-monitor processes..."

MONITOR_PIDS=()
while IFS= read -r pid; do
  [[ -n "$pid" ]] && MONITOR_PIDS+=("$pid")
done < <(pgrep -f "training_monitor_" 2>/dev/null || true)

# Also find by script file in /tmp
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

# Clean up leftover script files and logs
if [[ ${#MONITOR_SCRIPTS[@]} -gt 0 ]]; then
  echo "  Cleaning up ${#MONITOR_SCRIPTS[@]} /tmp/training_monitor_* file(s)..."
  rm -f /tmp/training_monitor_*.py /tmp/training_monitor_*.log 2>/dev/null || true
  echo "  ✓ Cleaned /tmp/training_monitor_* files"
fi
echo ""

# ─── 4. Kill any Docling polling processes (from knowledge-extractor) ─────────

echo "→ Scanning for docling-related processes..."

DOCLING_PIDS=()
while IFS= read -r pid; do
  [[ -n "$pid" ]] && DOCLING_PIDS+=("$pid")
done < <(pgrep -f "docling_extract\|poll.*docling\|docling.*poll" 2>/dev/null || true)

if [[ ${#DOCLING_PIDS[@]} -gt 0 ]]; then
  echo "  Found ${#DOCLING_PIDS[@]} docling process(es)"
  for pid in "${DOCLING_PIDS[@]}"; do
    kill "$pid" 2>/dev/null && echo "  ✓ Killed docling PID $pid" || true
    TOTAL_KILLED=$((TOTAL_KILLED + 1))
  done
else
  echo "  No docling processes found"
fi
echo ""

# ─── 5. Summary ───────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
if [[ $TOTAL_KILLED -gt 0 ]]; then
  echo "  ✅ Killed $TOTAL_KILLED process(es) for $(basename "$PROJECT_DIR")"
else
  echo "  ℹ️  No running processes found for $(basename "$PROJECT_DIR")"
fi
echo "═══════════════════════════════════════════════════════"
