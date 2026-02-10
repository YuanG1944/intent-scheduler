# intent-scheduler-monorepo

Multi-package monorepo for plug-and-play scheduled workflows across LLM CLIs.

## Workspace Layout

- `packages/intent-scheduler`: MCP scheduler server (`external_only`)
- `packages/scheduler-clients`: integrator bridge clients (`opencode`, `claude_code`, `codex_cli`)
- `packages/skills`: reusable skills (minimal-config scheduler skill)

## Quick Start

Install all workspace dependencies from repo root:

```bash
bun install
```

Run scheduler server:

```bash
SCHEDULER_ADMIN_TOKEN=test-admin-token bun run dev:server
```

Run client bridge (example opencode):

```bash
INTEGRATOR=opencode \
INTEGRATOR_BASE_URL=http://127.0.0.1:4096 \
SCHEDULER_BRIDGE_PORT=9090 \
bun run dev:clients
```

One-command local start/stop:

```bash
bun run up
bun run down
```

`bun run up` loads `.env.local` if present, then starts both processes in background and writes logs to `.run/server.log` and `.run/clients.log`.

## Opencode MCP (stable logs + db path)

Use the helper launcher:

```bash
bash /Users/u0047610/Desktop/study/intent-scheduler/scripts/run-mcp-for-opencode.sh
```

This fixes:

- `SCHEDULER_DB_PATH=/Users/u0047610/Desktop/study/intent-scheduler/packages/intent-scheduler/intent_scheduler.db`
- `SCHEDULER_LOG_LEVEL=debug`
- `SCHEDULER_TICK_MS=1000`
- auto-start bridge on `SCHEDULER_BRIDGE_PORT` when not listening

Logs are always written to:

- `/Users/u0047610/Desktop/study/intent-scheduler/.run/mcp-stderr.log`
- `/Users/u0047610/Desktop/study/intent-scheduler/.run/mcp-bridge.log`

Note: for stdio MCP, `stdout` is reserved for protocol messages and must not be redirected.

Reference config snippet for OpenCode is at:

- `/Users/u0047610/Desktop/study/intent-scheduler/config/opencode-mcp.intent-scheduler.json`

## Standard Endpoints (from scheduler-clients)

- `POST /api/scheduler/execute`
- `POST /api/scheduler/callback`
- `GET /healthz`

Use these endpoints in `scheduler_create_task`:

- `execution.input.endpoint` -> `/api/scheduler/execute`
- `delivery.callback_url` -> `/api/scheduler/callback`

## Monorepo Commands

- `bun run dev:server`
- `bun run dev:clients`
- `bun run typecheck`
- `bun run test`
