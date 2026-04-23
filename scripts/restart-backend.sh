#!/bin/bash
#
# Restart the full backend stack (Distri server + vLLora gateway)
#
# Usage:
#   ./scripts/restart-backend.sh
#
# What it does:
#   1. Kills processes on ports 8081, 9090, 9091
#   2. Cleans Distri cache (.distri folder)
#   3. Starts Distri server on port 8081
#   4. Starts vLLora gateway on ports 9090/9091
#

set -e

DISTRI_DIR="/Users/anhthuduong/Documents/GitHub/distri"
VLLORA_DIR="/Users/anhthuduong/Documents/GitHub/vllora"
DISTRI_PORT=8081
VLLORA_PORT=9090

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[restart]${NC} $1"; }
warn() { echo -e "${YELLOW}[restart]${NC} $1"; }
err()  { echo -e "${RED}[restart]${NC} $1"; }

# --- Step 1: Kill existing processes ---
log "Killing processes on ports 8081, 9090, 9091..."
for port in 8081 9090 9091; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    log "  Killed process(es) on port $port"
  fi
done
sleep 1

# --- Step 2: Clean Distri cache ---
# if [ -d "$DISTRI_DIR/.distri" ]; then
#   log "Deleting $DISTRI_DIR/.distri..."
#   rm -rf "$DISTRI_DIR/.distri"
# fi

# --- Step 3: Build Distri UI and start server ---
# log "Building Distri frontend..."
# cd "$DISTRI_DIR"
# VITE_PREFIX=ui pnpm run build > /tmp/distri-ui-build.log 2>&1
# if [ $? -ne 0 ]; then
#   err "Frontend build failed. Check /tmp/distri-ui-build.log"
#   tail -20 /tmp/distri-ui-build.log
#   exit 1
# fi
# log "  Frontend build complete"

# log "Starting Distri server on port $DISTRI_PORT..."
# cargo run --package distri-server-cli --features "ui sqlite" -- serve --port=$DISTRI_PORT > /tmp/distri-server.log 2>&1 &
# DISTRI_PID=$!
# log "  Distri PID: $DISTRI_PID (logs: /tmp/distri-server.log)"

# # Wait for Distri to be ready
# log "Waiting for Distri server (port $DISTRI_PORT)..."
# for i in $(seq 1 60); do
#   if lsof -ti :$DISTRI_PORT > /dev/null 2>&1; then
#     log "  Distri server ready after ${i}s"
#     break
#   fi
#   if ! kill -0 $DISTRI_PID 2>/dev/null; then
#     err "Distri server exited unexpectedly. Check /tmp/distri-server.log"
#     tail -20 /tmp/distri-server.log
#     exit 1
#   fi
#   sleep 1
# done

# if ! lsof -ti :$DISTRI_PORT > /dev/null 2>&1; then
#   err "Distri server failed to start within 60s"
#   tail -20 /tmp/distri-server.log
#   exit 1
# fi

# --- Step 4: Start vLLora gateway ---
log "Starting vLLora gateway on port $VLLORA_PORT..."
cd "$VLLORA_DIR"
LANGDB_API_KEY=langdb_QWQxV0E4VW1IUE9nQ2o5bTJTeHNHZFdPVnBFTHlD \
LANGDB_API_URL=https://api.staging.langdb.ai \
cargo run > /tmp/vllora-gateway.log 2>&1 &
VLLORA_PID=$!
log "  vLLora PID: $VLLORA_PID (logs: /tmp/vllora-gateway.log)"

# Wait for vLLora to be ready
log "Waiting for vLLora gateway (port $VLLORA_PORT)..."
for i in $(seq 1 120); do
  if lsof -ti :$VLLORA_PORT > /dev/null 2>&1; then
    log "  vLLora gateway ready after ${i}s"
    break
  fi
  if ! kill -0 $VLLORA_PID 2>/dev/null; then
    err "vLLora gateway exited unexpectedly. Check /tmp/vllora-gateway.log"
    tail -20 /tmp/vllora-gateway.log
    exit 1
  fi
  sleep 1
done

if ! lsof -ti :$VLLORA_PORT > /dev/null 2>&1; then
  err "vLLora gateway failed to start within 120s"
  tail -20 /tmp/vllora-gateway.log
  exit 1
fi

# --- Done ---
echo ""
log "========================================="
log "  Backend stack is ready!"
log "  Distri:  http://localhost:$DISTRI_PORT  (PID $DISTRI_PID)"
log "  vLLora:  http://localhost:$VLLORA_PORT  (PID $VLLORA_PID)"
log "========================================="
log "Logs:"
log "  Distri: tail -f /tmp/distri-server.log"
log "  vLLora: tail -f /tmp/vllora-gateway.log"
