---
name: intent-scheduler-minimal
description: 帮用户用最少输入创建和管理定时任务。默认自动补全配置，避免专业术语。适用于 opencode、Claude Code、Codex CLI 等会话回推场景。
---

# Intent Scheduler Minimal

目标：用尽量少的问题，把定时任务一次创建成功，并且让用户清楚这条任务是“会回复”还是“仅通知”。

## 执行原则

1. 优先直接创建，不先做参数盘问。
2. 除非必要，不暴露技术术语（adapter/callback/retry_policy）。
3. 创建后必须回读校验（`scheduler_get_task`），不要只信创建返回。
4. 所有确认文案都明确展示“否回复（是/否）”。

## 只向用户收集这 2-3 项

1. 做什么（`goal`）
2. 什么时候（`when`，可自然语言）
3. 发到哪个会话（`session_id`，缺省用当前会话）

## 默认值（无感配置）

除非用户明确指定，否则默认：

1. `workspace_id = "opencode-prod"`
2. `api_key`：优先用 `SCHEDULER_DEFAULT_API_KEY`
3. `title = goal`（超过 24 字截断）
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

1. `workspace_id` 缺省：`SCHEDULER_DEFAULT_WORKSPACE_ID`，再缺省用 `opencode-prod`
2. `session_id` 缺省：优先自动解析当前会话；失败才追问

## 时间理解（口语化）

支持表达：

1. 固定间隔：`每10秒 / 每5分钟 / 每小时`
2. 每日：`每天9点 / 每天18:30`
3. 每周：`每周一早上9点`

转换：

1. 固定间隔 -> `schedule.type = "interval"`
2. 日历重复 -> `schedule.type = "cron"`
3. 默认时区 `Asia/Shanghai`

## 回复意图判定（高成功率版，中文+英文）

你要主动把用户话术映射到“会回复/不回复”：

1. 问答型（否回复=否）
- 中文关键词：`提问/问题/请回答/总结/分析/解释/翻译/推荐`
- 英文关键词：`ask/question/answer/summarize/analyze/explain/translate/recommend`
- 特征：以 `?`、`？`、`吗/么/呢` 结尾，或出现明确问句
- 示例（中文）：`每30秒问：文件夹里有什么？`
- 示例（英文）：`Every 30 seconds ask: what is in this folder?`

2. 通知型（否回复=是）
- 中文关键词：`通知/提醒/发送/推送/转告`
- 英文关键词：`notify/remind/send/push/broadcast`
- 特征：强调“只发消息”而不要求模型回答
- 示例：`每30秒通知：构建进行中`

3. 显式覆盖（最高优先级）
- `无需回复/不需要回复/仅发送` -> 否回复=是
- `需要回复/请回复` -> 否回复=否
- `no reply/do not reply/silent send` -> 否回复=是
- `need reply/please reply/wait for response` -> 否回复=否

## 冲突消解规则

当一条话里同时出现“提问”和“通知”时：

1. 先看显式覆盖短语（上节第 3 条）
2. 没有显式覆盖时：
- 包含问句特征（`?`/`？`/`吗么呢`）优先判为问答型
- 包含英文问句词（`what/why/how/when/where/which/who`）优先判为问答型
- 否则判为通知型
3. 仍然不确定：只问一个问题
- `这条任务需要模型每次都回复吗？（是/否）`

## 工具流程（必须遵守）

创建：

1. 先调 `scheduler_create_task_quick`
2. 立即调 `scheduler_get_task` 回读
3. 若回读失败，再调一次 `scheduler_get_task`
4. 仍失败时告知“任务已创建但回读失败”，并给 `task_id`

管理：

1. 查看：`scheduler_list_tasks` / `scheduler_list_runs`
2. 暂停：`scheduler_pause_task`
3. 恢复：`scheduler_resume_task`
4. 删除：`scheduler_delete_task`
5. 立即执行一次：`scheduler_run_task_now`

## 创建成功回执模板（固定）

创建成功后，用下面 6 项回复：

1. 任务 ID
2. 状态
3. 内容（goal）
4. 执行频率/时间
5. 下次执行时间
6. 否回复（是/否）

并追加一句：

1. `取消：调用 scheduler_delete_task(task_id=...)`

## 常见失败与处理

1. 未授权（workspace/api_key）
- 优先提示检查环境变量（不让用户手填技术字段）

2. 回调投递失败
- 告知“任务执行可能成功，但消息回写失败”，建议查看 `scheduler_list_runs`

3. 会话 ID 缺失
- 先尝试自动解析当前会话
- 失败再追问 `session_id`

## 避免误导（强约束）

1. 不主动让用户选“发到哪里（Lark/Webhook/终端）”。
2. 不把 callback 作为用户输入项。
3. 默认目标是 `session_id`。
4. 仅当用户明确要求改底层路由时才暴露技术字段。

## 高命中话术示例

1. 问答型
- `每30秒提问：请你用一句话总结当前目录作用`
- `每1分钟问：文件夹里有什么？`

2. 通知型
- `每30秒通知：构建正常（无需回复）`
- `每天9点发送：日报已生成，仅发送`
3. Ask/Question (English)
- `Every 30 seconds ask: summarize this directory in one sentence`
- `Every 1 minute ask: what files are in this folder?`

4. Notify (English)
- `Every 30 seconds notify: build is healthy (no reply)`
- `Send daily at 9:00: report generated, silent send`

详细 payload 示例参考 `references/payloads.md`。
