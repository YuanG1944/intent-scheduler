# Payload Templates

## 默认创建模板（推荐）

```json
{
  "workspace_id": "opencode-prod",
  "api_key": "***",
  "title": "10秒问候",
  "goal": "跟大家说你好",
  "schedule": {
    "type": "interval",
    "expression": "PT10S",
    "timezone": "Asia/Shanghai"
  },
  "execution": {
    "adapter": "http_json",
    "session_id": "ses_xxx",
    "input": {
      "endpoint": "http://127.0.0.1:9090/api/scheduler/execute",
      "method": "POST",
      "timeout_ms": 30000,
      "payload": {
        "message": "你好"
      }
    }
  },
  "delivery": {
    "callback_url": "http://127.0.0.1:9090/api/scheduler/callback"
  },
  "retry_policy": {
    "max_attempts": 3,
    "backoff": "exponential",
    "base_delay_ms": 60000
  },
  "disallow_overlap": true
}
```

## 每天固定时间（示例）

```json
{
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

## 一句话 -> 参数映射（超简模式）

用户输入：

`每10秒提醒我说你好`

最小映射结果：

```json
{
  "title": "提醒我说你好",
  "goal": "提醒我说你好",
  "schedule": {
    "type": "interval",
    "expression": "PT10S",
    "timezone": "Asia/Shanghai"
  },
  "execution": {
    "session_id": "ses_xxx"
  }
}
```

其余字段全部使用默认值（workspace/api_key/adapter/endpoints/retry/disallow_overlap）。

## Quick management payloads

Pause/resume/delete/run-now:

```json
{
  "workspace_id": "opencode-prod",
  "api_key": "***",
  "task_id": "task_xxx"
}
```
