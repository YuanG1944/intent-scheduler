---
name: intent-scheduler-minimal
description: 帮用户用最少输入创建和管理定时任务。默认自动补全配置，避免专业术语。适用于 opencode、Claude Code、Codex CLI 等会话回推场景。
---

# Intent Scheduler Minimal

用这个 skill 时，优先“少问问题、直接可用”。不要让用户填写技术字段。

## 用户只需要提供

只收集下面 2-3 项：

1. 要做什么（`goal`）
2. 什么时候执行（`when`，可以自然语言）
3. 发到哪个会话（`session_id`，默认当前会话）

其余字段全部默认补齐。

## 默认值（无感配置）

除非用户明确指定，否则固定用这些值：

1. `workspace_id = "opencode-prod"`
2. `api_key` 优先使用 `SCHEDULER_DEFAULT_API_KEY`（没有再向用户要）
3. `title = goal`（太长则截断到 24 字）
4. `execution.adapter = "http_json"`
5. `schedule.timezone = "Asia/Shanghai"`
6. `execution.input.endpoint = "http://127.0.0.1:9090/api/scheduler/execute"`
7. `delivery.callback_url = "http://127.0.0.1:9090/api/scheduler/callback"`
8. `execution.input.method = "POST"`
9. `execution.input.timeout_ms = 30000`
10. `retry_policy.max_attempts = 3`
11. `retry_policy.backoff = "exponential"`
12. `retry_policy.base_delay_ms = 60000`
13. `disallow_overlap = true`

补充：

1. `workspace_id` 可不传，默认读 `SCHEDULER_DEFAULT_WORKSPACE_ID`，没有则用 `opencode-prod`
2. `session_id` 可不传，优先从当前调用上下文自动解析

仅在默认值明显不适用时，才追问一个问题。

## 时间处理（口语化）

支持用户直接说：

1. “每 10 秒 / 每 5 分钟 / 每小时”
2. “每天 9 点”
3. “每周一早上 9 点”

转换规则：

1. 固定间隔 -> `schedule.type = "interval"`
2. 日历型重复 -> `schedule.type = "cron"`
3. 默认时区 `Asia/Shanghai`

## 回复意图（no_reply）判定提示

为了提升“定时提问/定时通知”命中率，创建任务时尽量把意图写清楚：

1. 需要模型回答：在 `goal` 中使用“提问/请回答/请你总结/请分析/请解释”等表达
2. 仅做通知推送：在 `goal` 中使用“通知/提醒/发送”，并可附加“无需回复/不需要回复”
3. 意图冲突时，优先尊重显式短语：
- “不需要回复/无需回复/仅发送” => 否回复=是
- “需要回复/请回复” => 否回复=否

## 工具调用流程

创建任务时：

1. 优先调用 `scheduler_create_task_quick`
2. 成功后用 `scheduler_get_task` 回读并确认 `next_run_at`
3. 用人话告诉用户“已创建，下一次执行时间是…”

管理任务时：

1. 查看：`scheduler_list_tasks` / `scheduler_list_runs`
2. 暂停：`scheduler_pause_task`
3. 恢复：`scheduler_resume_task`
4. 取消：`scheduler_delete_task`
5. 立即执行一次：`scheduler_run_task_now`

## 交互风格要求（重要）

1. 优先中文口语，不要先抛字段名。
2. 不主动讲 `adapter/callback/retry_policy` 这类术语。
3. 只有在用户追问“技术细节”时才展示完整 payload。
4. 默认展示简版确认：
- 任务名
- 频率
- 目标会话
- 下次执行时间

## 渠道选择规则（避免误导）

1. 不要让用户选择“发送到哪里（Lark/Webhook/本地终端）”。
2. 本 skill 的默认目标始终是 `session_id` 对应的会话。
3. `webhook`/`callback` 属于内部实现细节，不作为用户交互选项。
4. 只有用户明确要求改技术路由时，才展示底层字段。

## 超简触发词模板

当用户说法接近下面句式时，直接创建任务，不要再问技术参数：

1. “每10秒提醒我说你好”
2. “每天9点把日报发到这个会话”
3. “每周一早上10点提醒我看告警”

映射规则：

1. `goal` = 用户原话里“要做的事”
2. `title` = `goal`（必要时截断）
3. `session_id` 处理规则：
- 先尝试从当前运行环境读取当前会话 ID
- 若可读取，直接使用
- 只有读取失败时才追问用户
4. `schedule` 自动从自然语言转换
5. 其余全部走默认值

创建成功后直接回复：

1. 已创建
2. 下次执行时间
3. 否回复（是/否）
4. 取消方式（`scheduler_delete_task`）

详细 payload 示例参考 `references/payloads.md`。
