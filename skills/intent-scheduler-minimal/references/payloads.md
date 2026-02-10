# Payload Templates

## Minimal create payload

```json
{
  "workspace_id": "opencode-prod",
  "api_key": "***",
  "title": "weekly-report",
  "goal": "汇总本周错误并给出处理建议",
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * 1",
    "timezone": "Asia/Shanghai"
  },
  "execution": {
    "adapter": "http_json",
    "session_id": "sess_xxx",
    "input": {
      "endpoint": "https://integrator.example.com/api/scheduler/execute",
      "method": "POST",
      "timeout_ms": 30000,
      "payload": {
        "template": "weekly-report"
      }
    }
  },
  "delivery": {
    "callback_url": "https://integrator.example.com/api/scheduler/callback"
  },
  "retry_policy": {
    "max_attempts": 3,
    "backoff": "exponential",
    "base_delay_ms": 60000
  },
  "disallow_overlap": true
}
```

## Interval payload

```json
{
  "schedule": {
    "type": "interval",
    "expression": "PT30M",
    "timezone": "Asia/Shanghai"
  }
}
```

## Quick management payloads

Pause/resume/delete/run-now:

```json
{
  "workspace_id": "opencode-prod",
  "api_key": "***",
  "task_id": "task_xxx"
}
```
