#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
SERVER_PID_FILE="$RUN_DIR/server.pid"
CLIENTS_PID_FILE="$RUN_DIR/clients.pid"

stop_one() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name not running (no pid file)"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "stopped $name pid=$pid"
  else
    echo "$name pid=$pid already stopped"
  fi
  rm -f "$pid_file"
}

stop_one "$SERVER_PID_FILE" "server"
stop_one "$CLIENTS_PID_FILE" "clients"
