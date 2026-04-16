#!/usr/bin/env bash
#
# Quick status check for a running finetune test.
# Returns JSON with current state for the test loop agent.
#
# Usage: ./scripts/check-finetune-status.sh <scenario-dir>
# Output: JSON to stdout
#
set -euo pipefail

SCENARIO_DIR="${1:?Usage: check-finetune-status.sh <scenario-dir>}"
SCENARIO=$(basename "$SCENARIO_DIR")

# Find latest run
RUNS_DIR="$SCENARIO_DIR/finetune-runs"
LATEST_RUN=""
if [ -d "$RUNS_DIR" ]; then
  LATEST_RUN=$(ls -1d "$RUNS_DIR"/run-* 2>/dev/null | sort | tail -1)
fi

# No runs yet
if [ -z "$LATEST_RUN" ]; then
  echo '{"status":"no_runs","scenario":"'"$SCENARIO"'","run_id":null,"turn":0,"last_line":null,"agent_running":false}'
  exit 0
fi

RUN_ID=$(basename "$LATEST_RUN")
PID_FILE="$LATEST_RUN/pid"
TRANSCRIPT="$LATEST_RUN/transcript.md"
STREAM="$LATEST_RUN/stream.jsonl"

# Check if agent is running
AGENT_RUNNING=false
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    AGENT_RUNNING=true
  fi
fi

# Count turns
TURN_COUNT=0
if [ -f "$TRANSCRIPT" ]; then
  TURN_COUNT=$(grep -c "^## Turn" "$TRANSCRIPT" 2>/dev/null || echo 0)
fi

# Get last meaningful line from transcript
LAST_LINE=""
if [ -f "$TRANSCRIPT" ]; then
  LAST_LINE=$(tail -5 "$TRANSCRIPT" 2>/dev/null | grep -v "^$" | tail -1 | head -c 200)
fi

# Check for errors in recent output
HAS_ERROR=false
ERROR_MSG=""
if [ -f "$TRANSCRIPT" ]; then
  ERROR_MSG=$(tail -50 "$TRANSCRIPT" 2>/dev/null | grep -i "error\|FATAL\|FAIL\|413\|404\|500" | tail -1 | head -c 200)
  if [ -n "$ERROR_MSG" ]; then
    HAS_ERROR=true
  fi
fi

# Check stream size for activity
STREAM_SIZE=0
if [ -f "$STREAM" ]; then
  STREAM_SIZE=$(wc -l < "$STREAM" 2>/dev/null | tr -d ' ')
fi

# Check for finetune-project artifacts
HAS_CONFIG=false
HAS_TRAINING=false
HAS_EVAL=false
HAS_GRADER=false
[ -f "$SCENARIO_DIR/finetune-project/config.json" ] && HAS_CONFIG=true
[ -f "$SCENARIO_DIR/finetune-project/training.jsonl" ] && HAS_TRAINING=true
[ -d "$SCENARIO_DIR/finetune-project/test-runs" ] && HAS_EVAL=true
[ -f "$SCENARIO_DIR/finetune-project/quality-checker/grader.js" ] && HAS_GRADER=true

# Determine pipeline step from artifacts
PIPELINE_STEP="unknown"
if [ "$HAS_EVAL" = true ]; then
  PIPELINE_STEP="eval_or_later"
elif [ "$HAS_GRADER" = true ]; then
  PIPELINE_STEP="grader_done"
elif [ "$HAS_TRAINING" = true ]; then
  PIPELINE_STEP="records_done"
elif [ "$HAS_CONFIG" = true ]; then
  PIPELINE_STEP="started"
fi

# Determine overall status
STATUS="unknown"
if [ "$AGENT_RUNNING" = true ]; then
  STATUS="running"
elif [ "$TURN_COUNT" -gt 0 ] && [ "$AGENT_RUNNING" = false ]; then
  STATUS="completed"
fi

# Check gateway for workflow data
WF_ID=""
RECORD_COUNT=0
if [ -f "$SCENARIO_DIR/finetune-project/config.json" ]; then
  WF_ID=$(python3 -c "import json; print(json.load(open('$SCENARIO_DIR/finetune-project/config.json')).get('workflow_id',''))" 2>/dev/null || echo "")
  if [ -n "$WF_ID" ] && curl -s --connect-timeout 2 "http://localhost:9090/health" >/dev/null 2>&1; then
    RECORD_COUNT=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/records/count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo 0)
  fi
fi

cat << EOF
{
  "status": "$STATUS",
  "scenario": "$SCENARIO",
  "run_id": "$RUN_ID",
  "turn": $TURN_COUNT,
  "stream_events": $STREAM_SIZE,
  "agent_running": $AGENT_RUNNING,
  "pipeline_step": "$PIPELINE_STEP",
  "has_error": $HAS_ERROR,
  "error_msg": $(python3 -c "import json; print(json.dumps('$ERROR_MSG'))" 2>/dev/null || echo '""'),
  "last_line": $(python3 -c "import json; print(json.dumps('''$LAST_LINE'''))" 2>/dev/null || echo '""'),
  "workflow_id": "$WF_ID",
  "record_count": $RECORD_COUNT,
  "artifacts": {
    "config": $HAS_CONFIG,
    "training_jsonl": $HAS_TRAINING,
    "grader": $HAS_GRADER,
    "eval": $HAS_EVAL
  }
}
EOF
