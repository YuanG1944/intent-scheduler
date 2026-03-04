#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  source "$ROOT_DIR/.env.local"
  set +a
fi

: "${SCHEDULER_ADMIN_TOKEN:=test-admin-token}"
: "${INTEGRATOR:=opencode}"
: "${INTEGRATOR_BASE_URL:=http://127.0.0.1:4096}"
: "${INTEGRATOR_SESSION_INGEST_URL:=http://127.0.0.1:3000/api/session/message}"
: "${SCHEDULER_BRIDGE_PORT:=9090}"

SERVER_LOG="$RUN_DIR/server.log"
CLIENTS_LOG="$RUN_DIR/clients.log"
SERVER_PID_FILE="$RUN_DIR/server.pid"
CLIENTS_PID_FILE="$RUN_DIR/clients.pid"

if [[ -f "$SERVER_PID_FILE" ]] && kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
  echo "server already running (pid=$(cat "$SERVER_PID_FILE"))"
else
  (
    cd "$ROOT_DIR"
    SCHEDULER_ADMIN_TOKEN="$SCHEDULER_ADMIN_TOKEN" bun run dev:server
  ) >"$SERVER_LOG" 2>&1 &
  echo $! >"$SERVER_PID_FILE"
  echo "started server pid=$(cat "$SERVER_PID_FILE") log=$SERVER_LOG"
fi

if [[ -f "$CLIENTS_PID_FILE" ]] && kill -0 "$(cat "$CLIENTS_PID_FILE")" 2>/dev/null; then
  echo "clients already running (pid=$(cat "$CLIENTS_PID_FILE"))"
elif lsof -nP -iTCP:"$SCHEDULER_BRIDGE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "clients skipped: port $SCHEDULER_BRIDGE_PORT already in use"
else
  (
    cd "$ROOT_DIR"
    INTEGRATOR="$INTEGRATOR" \
    INTEGRATOR_BASE_URL="$INTEGRATOR_BASE_URL" \
    INTEGRATOR_SESSION_INGEST_URL="$INTEGRATOR_SESSION_INGEST_URL" \
    SCHEDULER_BRIDGE_PORT="$SCHEDULER_BRIDGE_PORT" \
    bun run dev:clients
  ) >"$CLIENTS_LOG" 2>&1 &
  echo $! >"$CLIENTS_PID_FILE"
  echo "started clients pid=$(cat "$CLIENTS_PID_FILE") log=$CLIENTS_LOG"
fi

echo ""
echo "quick status:"
if [[ -f "$SERVER_PID_FILE" ]]; then
  echo "  server  pid=$(cat "$SERVER_PID_FILE")"
fi
if [[ -f "$CLIENTS_PID_FILE" ]]; then
  echo "  clients pid=$(cat "$CLIENTS_PID_FILE")"
fi

echo ""
echo "tail logs:"
echo "  tail -f $SERVER_LOG $CLIENTS_LOG"
