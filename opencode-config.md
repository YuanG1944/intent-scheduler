## Global `AGENTS.md`

```shell
# Global Skills Index

Skills are discovered from:
- `/path/.config/opencode/projects/*`

Each entry under `projects/` should be a symlink to one repo's `packages/skills` directory.

Current entries:
- `/Users/u0047610/.config/opencode/projects/intent-scheduler`

Usage:
1. Match user intent to `projects/*/<skill>/SKILL.md`.
2. Prefer the smallest relevant skill set.
3. If a linked path is missing, continue with best-effort fallback.
```

## Link to every skills from project

```shell
ln -sfn /your/path/intent-scheduler/packages/skills /your/path/.config/opencode/projects/intent-scheduler
```

## MCP `environment` (zero-init)

Use this environment block so chat can create tasks without first asking for `workspace_id`, `api_key`, or `callback_url`:

```json
{
  "SCHEDULER_ADMIN_TOKEN": "test-admin-token",
  "SCHEDULER_DEFAULT_WORKSPACE_ID": "opencode-prod",
  "SCHEDULER_DEFAULT_WORKSPACE_NAME": "Opencode Workspace",
  "SCHEDULER_DEFAULT_API_KEY": "opencode-prod-key",
  "SCHEDULER_DEFAULT_TIMEZONE": "Asia/Shanghai",
  "SCHEDULER_DEFAULT_EXECUTE_ENDPOINT": "http://127.0.0.1:9090/api/scheduler/execute",
  "SCHEDULER_DEFAULT_CALLBACK_URL": "http://127.0.0.1:9090/api/scheduler/callback",
  "INTEGRATOR": "opencode",
  "INTEGRATOR_BASE_URL": "http://127.0.0.1:4096",
  "SCHEDULER_BRIDGE_PORT": "9090",
  "OPENCODE_NO_REPLY": "false"
}
```

`OPENCODE_NO_REPLY`:
- `true` (default): only append message to session, do not trigger model reply
- `false`: send as user prompt and trigger model reply (recommended for "定时提问")
