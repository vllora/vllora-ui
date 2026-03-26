#!/usr/bin/env bash
#
# Stop a running finetune agent.
#
# Usage:
#   ./scripts/stop-finetune-agent.sh <project-dir>
#   ./scripts/stop-finetune-agent.sh ~/test-samples/contract-translator
#
# Finds the latest run's PID file and sends SIGTERM to stop gracefully.
# The run script's trap handler will clean up and finalize the transcript.

set -euo pipefail

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
for run_dir in "$PROJECT_DIR"/finetune-runs/run-*/; do
  [[ -f "$run_dir/pid" ]] && LATEST_PID_FILE="$run_dir/pid"
done

if [[ -z "$LATEST_PID_FILE" || ! -f "$LATEST_PID_FILE" ]]; then
  echo "No running finetune agent found for $(basename "$PROJECT_DIR")"
  echo ""
  echo "Checked: $PROJECT_DIR/finetune-runs/*/pid"
  exit 1
fi

PID=$(cat "$LATEST_PID_FILE")
RUN_DIR=$(dirname "$LATEST_PID_FILE")
RUN_ID=$(basename "$RUN_DIR")

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping finetune agent..."
  echo "  Run:  $RUN_ID"
  echo "  PID:  $PID"

  # Send SIGTERM for graceful shutdown
  kill "$PID" 2>/dev/null

  # Wait up to 10 seconds for it to exit
  for i in $(seq 1 10); do
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "  ✓ Agent stopped"
      rm -f "$LATEST_PID_FILE"
      exit 0
    fi
    sleep 1
  done

  # Force kill if still running
  echo "  Agent didn't stop gracefully, force killing..."
  kill -9 "$PID" 2>/dev/null || true
  rm -f "$LATEST_PID_FILE"
  echo "  ✓ Agent killed"
else
  echo "Agent (PID $PID) is not running. Cleaning up stale PID file."
  rm -f "$LATEST_PID_FILE"
fi
