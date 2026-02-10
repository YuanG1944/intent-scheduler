# Agent Defaults

## Intent Scheduler Skill (Default)

When the user asks about scheduling, recurring tasks, reminders, periodic execution, task runs, or pushing results back to a conversation/session, use this skill by default:

- `/Users/u0047610/Desktop/study/intent-scheduler/packages/skills/intent-scheduler/SKILL.md`

### Default behavior

1. Use the skill's minimal-input workflow.
2. Prefer plain-language Chinese, avoid technical terms unless the user asks.
3. Auto-fill defaults whenever possible.
4. Ask for technical fields only when strictly required.

### Minimal required user input

1. What to do (`goal`)
2. When to run (`when`, natural language is fine)
3. Target session (`session_id`) only if current session cannot be inferred

### Session ID default rule

1. Always try to resolve current session ID from runtime/context first.
2. If resolved, use it automatically.
3. Ask user for `session_id` only when auto-resolution fails.

### Built-in defaults

- `workspace_id = SCHEDULER_DEFAULT_WORKSPACE_ID` (fallback: `opencode-prod`)
- `api_key = SCHEDULER_DEFAULT_API_KEY` (if missing, ask user)
- `schedule.timezone = Asia/Shanghai`
- `execution.adapter = http_json`
- `execution.input.endpoint = http://127.0.0.1:9090/api/scheduler/execute`
- `delivery.callback_url = http://127.0.0.1:9090/api/scheduler/callback`
- `retry_policy.max_attempts = 3`
- `retry_policy.backoff = exponential`
- `retry_policy.base_delay_ms = 60000`
- `disallow_overlap = true`

### One-sentence trigger examples

- "每10秒提醒我说你好"
- "每天9点把日报发到这个会话"
- "每周一早上10点提醒我看告警"
