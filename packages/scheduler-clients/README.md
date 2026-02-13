# @intent-scheduler/clients

Bridge package for plugging `intent-scheduler` into different integrators/CLIs.

## Integrator-first structure

- `opencode`
- `claude_code`
- `codex_cli`
- `others` (generic HTTP fallback)

Each integrator has its own directory and SDK entry:

- `src/integrators/opencode/*`
- `src/integrators/claude-code/*`
- `src/integrators/codex-cli/*`
- `src/integrators/others/*`

Selection is done at runtime via `INTEGRATOR`.

By default, `/api/scheduler/execute` is an echo executor (returns `SUCCEEDED` with the input message/goal).
Replace `hooks.executeTask` in `src/server.ts` to run your real integrator workflow.

## Run bridge server

```bash
INTEGRATOR=opencode \
INTEGRATOR_BASE_URL=http://127.0.0.1:4096 \
SCHEDULER_BRIDGE_PORT=9090 \
bun run src/server.ts
```

## Required env

- `INTEGRATOR`: `opencode|claude_code|codex_cli|others`
- `INTEGRATOR_BASE_URL`: SDK integrator service base URL (used by `opencode`)
- `INTEGRATOR_SESSION_INGEST_URL`: target session message ingest URL (required for `others`)

## Optional env

- `SESSION_POST_TOKEN`: bearer token used to post session messages
- `SCHEDULER_CALLBACK_BEARER_TOKEN`: verify scheduler callback auth
- `SCHEDULER_BRIDGE_PORT`: bridge port (default `9090`)
- `OPENCODE_NO_REPLY_MODE`: `auto|always_true|always_false` (default `auto`)
- `OPENCODE_NO_REPLY`: fallback default used by `auto` mode (`true` by default)

`auto` mode behavior:
- question-like content (`?`/`？`/提问/问题/ask/question) -> `noReply=false` (let model answer)
- notify-like content (回复/回答/通知/发送/reply/respond/notify) -> `noReply=true`
