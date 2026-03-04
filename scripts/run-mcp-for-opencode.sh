#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

: "${SCHEDULER_ADMIN_TOKEN:=test-admin-token}"
: "${SCHEDULER_LOG_LEVEL:=debug}"
: "${SCHEDULER_TICK_MS:=1000}"
: "${SCHEDULER_DB_PATH:=$ROOT_DIR/packages/intent-scheduler/intent_scheduler.db}"
: "${INTEGRATOR:=opencode}"
: "${INTEGRATOR_BASE_URL:=http://127.0.0.1:4096}"
: "${SCHEDULER_BRIDGE_PORT:=9090}"

export SCHEDULER_ADMIN_TOKEN
export SCHEDULER_LOG_LEVEL
export SCHEDULER_TICK_MS
export SCHEDULER_DB_PATH

BRIDGE_LOG="$RUN_DIR/mcp-bridge.log"
BRIDGE_PID_FILE="$RUN_DIR/mcp-bridge.pid"
STARTED_BRIDGE=0

bridge_log() {
  printf '%s\n' "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"msg\":\"$1\"}" >>"$BRIDGE_LOG"
}

cleanup() {
  bridge_log "mcp.wrapper.cleanup"
  if [[ "$STARTED_BRIDGE" -eq 1 && -f "$BRIDGE_PID_FILE" ]]; then
    local pid
    pid="$(cat "$BRIDGE_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      bridge_log "mcp.wrapper.stop_bridge pid=$pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$BRIDGE_PID_FILE"
  fi
}
trap cleanup EXIT

if ! lsof -nP -iTCP:"$SCHEDULER_BRIDGE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  bridge_log "mcp.wrapper.start_bridge port=$SCHEDULER_BRIDGE_PORT"
  (
    cd "$ROOT_DIR"
    INTEGRATOR="$INTEGRATOR" \
    INTEGRATOR_BASE_URL="$INTEGRATOR_BASE_URL" \
    SCHEDULER_BRIDGE_PORT="$SCHEDULER_BRIDGE_PORT" \
    bun run dev:clients
  ) >>"$BRIDGE_LOG" 2>&1 &
  echo $! >"$BRIDGE_PID_FILE"
  STARTED_BRIDGE=1

  for _ in {1..20}; do
    if lsof -nP -iTCP:"$SCHEDULER_BRIDGE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      bridge_log "mcp.wrapper.bridge_ready port=$SCHEDULER_BRIDGE_PORT"
      break
    fi
    sleep 0.2
  done
else
  bridge_log "mcp.wrapper.bridge_already_ready port=$SCHEDULER_BRIDGE_PORT"
fi

exec bun run "$ROOT_DIR/packages/intent-scheduler/index.ts" \
  2>>"$RUN_DIR/mcp-stderr.log"
