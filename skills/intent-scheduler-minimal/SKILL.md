---
name: intent-scheduler-minimal
description: Create and manage intent-scheduler MCP tasks with minimal user input and safe defaults. Use when a user asks to schedule recurring work, push results to a session_id, or quickly set up scheduler_create_task/scheduler_list_tasks/scheduler_list_runs for opencode, Claude Code, Codex CLI, or similar integrators.
---

# Intent Scheduler Minimal

Use this skill to minimize configuration when creating and operating scheduled tasks.

## Minimal Input Contract

Collect only these required values from the user:

1. `workspace_id`
2. `api_key`
3. `session_id`
4. `goal`
5. `when` (natural language or explicit schedule)

Infer everything else from defaults.

## Default Policy

Apply these defaults unless user explicitly overrides:

1. `execution.adapter = "http_json"`
2. `schedule.timezone = "Asia/Shanghai"`
3. `retry_policy.max_attempts = 3`
4. `retry_policy.backoff = "exponential"`
5. `retry_policy.base_delay_ms = 60000`
6. `disallow_overlap = true`
7. `execution.input.method = "POST"`
8. `execution.input.timeout_ms = 30000`

For URLs:

1. Use `execution.input.endpoint` from runtime config if available.
2. Use `delivery.callback_url` from runtime config if available.
3. If either is missing and cannot be discovered, ask one concise question for the missing URL.

## Time Handling

Convert user `when` into scheduler-native format before calling MCP tool:

1. If user already provides cron/interval, use directly.
2. If user gives natural language, convert to:
- `schedule.type = "cron"` for calendar recurrence
- `schedule.type = "interval"` for fixed cadence
3. Ensure timezone is set explicitly.

## Tool Workflow

Execute tools in this sequence:

1. Optional bootstrap: `scheduler_upsert_workspace` only when workspace/key is missing or rotating.
2. Create: `scheduler_create_task`
3. Verify: `scheduler_get_task`
4. Explain next run time in user language.

For management requests:

1. List tasks: `scheduler_list_tasks`
2. Pause/resume/delete: `scheduler_pause_task` / `scheduler_resume_task` / `scheduler_delete_task`
3. Manual run: `scheduler_run_task_now`
4. Run history: `scheduler_list_runs`

## Cross-Integrator Mapping

Treat integrator differences as mapping only. Keep scheduler contract unchanged.

1. `session_id` is always the target conversation/session identifier.
2. `execution.input.endpoint` is always integrator execution ingress.
3. `delivery.callback_url` is always integrator message ingest endpoint.

Do not add product-specific fields into the scheduler task schema.

## Output Template

When creating a task, present:

1. Final normalized payload (redact secrets)
2. `task_id`
3. `next_run_at`
4. Retry policy summary

Use compact JSON examples from `references/payloads.md`.
