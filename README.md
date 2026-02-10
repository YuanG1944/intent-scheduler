# intent-scheduler

A TypeScript + Bun MCP server for `external_only` scheduled workflows.

## Positioning

`intent-scheduler` is a standalone scheduling/orchestration service.

- It does **not** parse natural language time.
- It does **not** call LLM providers directly.
- It does **not** depend on any specific Feishu/plugin implementation.

It only needs one business identifier: `session_id` (conversation/session id in your integrator), and it pushes execution results back to the target session through your integrator callback/message ingest endpoint.

## Architecture

- MCP tool layer: create/manage tasks and runs.
- Scheduler core: due scanning, state machine, retry.
- Adapter layer: external executor dispatch (generic `http_json` + `opencode` alias).
- Delivery layer: POST run updates to callback URL with retry.
- Storage: SQLite (`workspaces`, `tasks`, `task_runs`, `delivery_logs`).

## Quick start

```bash
bun install
SCHEDULER_ADMIN_TOKEN=change-me bun run dev
```

## Environment variables

- `SCHEDULER_DB_PATH` (default `./intent_scheduler.db`)
- `SCHEDULER_TICK_MS` (default `30000`)
- `SCHEDULER_ADMIN_TOKEN` (required for `scheduler_upsert_workspace`)
- `SCHEDULER_CALLBACK_BEARER_TOKEN` (optional; injected into callback Authorization header)
- `SCHEDULER_CALLBACK_ALLOWLIST` (optional; comma-separated hosts)

## MCP tools

- `scheduler_upsert_workspace`
- `scheduler_create_task`
- `scheduler_list_tasks`
- `scheduler_get_task`
- `scheduler_pause_task`
- `scheduler_resume_task`
- `scheduler_delete_task`
- `scheduler_run_task_now`
- `scheduler_list_runs`

All runtime tools require `workspace_id` + `api_key`.

## Core task contract

`scheduler_create_task` key input fields:

- `schedule`: standardized schedule only (`cron|interval`, timezone included)
- `execution.adapter`: `http_json` (recommended) or `opencode` (alias)
- `execution.session_id`: target session id (from Claude Code / Codex CLI / opencode / any integrator)
- `execution.input.endpoint`: your executor endpoint
- `delivery.callback_url`: your callback/message ingest endpoint (used to push run result back to session)

## Adapter dispatch payload

When a run is dispatched, adapter sends:

```json
{
  "task_id": "task_xxx",
  "run_id": "run_xxx",
  "workspace_id": "ws_xxx",
  "session_id": "session_xxx",
  "goal": "...",
  "skill_ref": "optional",
  "input": {}
}
```

## Callback payload (scheduler -> integrator)

```json
{
  "workspace_id": "ws_xxx",
  "task_id": "task_xxx",
  "run_id": "run_xxx",
  "session_id": "session_xxx",
  "status": "SUCCEEDED",
  "summary": "...",
  "result": {},
  "error": null,
  "attempt": 1,
  "started_at": "2026-02-10T10:00:00.000Z",
  "finished_at": "2026-02-10T10:00:03.000Z"
}
```

Headers include:

- `x-scheduler-task-id`
- `x-scheduler-run-id`
- optional `Authorization` from `SCHEDULER_CALLBACK_BEARER_TOKEN`

## Test

```bash
bun run typecheck
bun test
```
