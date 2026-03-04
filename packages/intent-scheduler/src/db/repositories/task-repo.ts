import { db } from "../client";
import type { CreateTaskInput, RunStatus, Task, TaskRun } from "../../types";
import { computeNextRunAt, nowIso } from "../../utils/time";
import { newId } from "../../utils/id";

const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 60_000;

export class TaskRepository {
  createTask(input: CreateTaskInput): Task {
    const ts = nowIso();
    const retryMaxAttempts = input.retry_policy?.max_attempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
    const retryBackoffMs = input.retry_policy?.base_delay_ms ?? DEFAULT_RETRY_BACKOFF_MS;
    const disallowOverlap = input.disallow_overlap ?? true;

    if (input.client_request_id) {
      const existing = db
        .query(
          "SELECT * FROM tasks WHERE workspace_id = ? AND client_request_id = ? AND status != 'DELETED'",
        )
        .get(input.workspace_id, input.client_request_id) as Task | null;
      if (existing) {
        return existing;
      }
    }

    const taskId = newId("task");
    const nextRunAt = computeNextRunAt(input.schedule);

    db.query(
      `INSERT INTO tasks (
        id, workspace_id, title, goal, schedule_type, schedule_expression, timezone,
        adapter, session_id, input_json, skill_ref, callback_url, callback_headers_json,
        retry_max_attempts, retry_backoff_base_ms, status, next_run_at, last_run_at,
        disallow_overlap, client_request_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, 'ACTIVE', ?, NULL,
        ?, ?, ?, ?
      )`,
    ).run(
      taskId,
      input.workspace_id,
      input.title,
      input.goal,
      input.schedule.type,
      input.schedule.expression,
      input.schedule.timezone,
      input.execution.adapter,
      input.execution.session_id,
      JSON.stringify(input.execution.input),
      input.execution.skill_ref ?? null,
      input.delivery.callback_url,
      input.delivery.callback_headers
        ? JSON.stringify(input.delivery.callback_headers)
        : null,
      retryMaxAttempts,
      retryBackoffMs,
      nextRunAt,
      disallowOverlap ? 1 : 0,
      input.client_request_id ?? null,
      ts,
      ts,
    );

    return this.getTask(input.workspace_id, taskId)!;
  }

  getTask(workspaceId: string, taskId: string): Task | null {
    return (
      db
        .query(
          "SELECT * FROM tasks WHERE workspace_id = ? AND id = ? AND status != 'DELETED'",
        )
        .get(workspaceId, taskId) as Task | null
    );
  }

  listTasks(
    workspaceId: string,
    filters: { status?: string; adapter?: string; limit?: number; cursor?: string },
  ): { tasks: Task[]; nextCursor: string | null } {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const statements = ["workspace_id = ?", "status != 'DELETED'"];
    const values: string[] = [workspaceId];

    if (filters.status) {
      statements.push("status = ?");
      values.push(filters.status);
    }
    if (filters.adapter) {
      statements.push("adapter = ?");
      values.push(filters.adapter);
    }
    if (filters.cursor) {
      statements.push("created_at < ?");
      values.push(filters.cursor);
    }

    const sql = `SELECT * FROM tasks WHERE ${statements.join(" AND ")}
      ORDER BY created_at DESC LIMIT ${limit + 1}`;
    const rows = db.query(sql).all(...values) as Task[];
    const hasNext = rows.length > limit;
    const tasks = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? tasks[tasks.length - 1]?.created_at ?? null : null;

    return { tasks, nextCursor };
  }

  updateTaskStatus(
    workspaceId: string,
    taskId: string,
    status: "ACTIVE" | "PAUSED" | "DELETED",
  ): Task | null {
    const ts = nowIso();
    db.query(
      "UPDATE tasks SET status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?",
    ).run(status, ts, workspaceId, taskId);
    return this.getTask(workspaceId, taskId);
  }

  getLatestRun(taskId: string): TaskRun | null {
    return (
      db
        .query("SELECT * FROM task_runs WHERE task_id = ? ORDER BY scheduled_at DESC LIMIT 1")
        .get(taskId) as TaskRun | null
    );
  }

  listRuns(
    workspaceId: string,
    filters: { task_id?: string; status?: string; limit?: number; cursor?: string },
  ): { runs: TaskRun[]; nextCursor: string | null } {
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const statements = ["workspace_id = ?"];
    const values: string[] = [workspaceId];

    if (filters.task_id) {
      statements.push("task_id = ?");
      values.push(filters.task_id);
    }
    if (filters.status) {
      statements.push("status = ?");
      values.push(filters.status);
    }
    if (filters.cursor) {
      statements.push("scheduled_at < ?");
      values.push(filters.cursor);
    }

    const sql = `SELECT * FROM task_runs WHERE ${statements.join(" AND ")}
      ORDER BY scheduled_at DESC LIMIT ${limit + 1}`;
    const rows = db.query(sql).all(...values) as TaskRun[];
    const hasNext = rows.length > limit;
    const runs = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? runs[runs.length - 1]?.scheduled_at ?? null : null;

    return { runs, nextCursor };
  }

  getDueTasks(now: string, limit = 200): Task[] {
    return db
      .query(
        `SELECT * FROM tasks
         WHERE status = 'ACTIVE' AND next_run_at <= ?
         ORDER BY next_run_at ASC
         LIMIT ?`,
      )
      .all(now, limit) as Task[];
  }

  hasActiveRun(taskId: string): boolean {
    const row = db
      .query(
        "SELECT id FROM task_runs WHERE task_id = ? AND status IN ('PENDING', 'RUNNING', 'RETRYING') LIMIT 1",
      )
      .get(taskId) as { id: string } | null;
    return Boolean(row);
  }

  scheduleTaskRun(task: Task, scheduledAt: string): TaskRun {
    const runId = newId("run");
    db.transaction(() => {
      db.query(
        `INSERT INTO task_runs (
          id, task_id, workspace_id, attempt, status, dispatch_ref,
          summary, result_json, error_json, scheduled_at,
          started_at, finished_at, next_retry_at
        ) VALUES (?, ?, ?, 1, 'PENDING', NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL)`,
      ).run(runId, task.id, task.workspace_id, scheduledAt);

      const nextRunAt = computeNextRunAt(
        {
          type: task.schedule_type,
          expression: task.schedule_expression,
          timezone: task.timezone,
        },
        scheduledAt,
      );

      db.query(
        "UPDATE tasks SET next_run_at = ?, last_run_at = ?, updated_at = ? WHERE id = ?",
      ).run(nextRunAt, scheduledAt, nowIso(), task.id);
    })();

    return this.getRun(runId)!;
  }

  createImmediateRun(task: Task): TaskRun {
    const runId = newId("run");
    const scheduledAt = nowIso();
    db.query(
      `INSERT INTO task_runs (
        id, task_id, workspace_id, attempt, status, dispatch_ref,
        summary, result_json, error_json, scheduled_at,
        started_at, finished_at, next_retry_at
      ) VALUES (?, ?, ?, 1, 'PENDING', NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL)`,
    ).run(runId, task.id, task.workspace_id, scheduledAt);

    return this.getRun(runId)!;
  }

  createOverlapSkippedRun(task: Task, scheduledAt: string): TaskRun {
    const runId = newId("run");
    const error = JSON.stringify({
      code: "OVERLAP_SKIPPED",
      message: "Task run skipped due to disallow_overlap=true",
    });

    db.transaction(() => {
      db.query(
        `INSERT INTO task_runs (
          id, task_id, workspace_id, attempt, status, dispatch_ref,
          summary, result_json, error_json, scheduled_at,
          started_at, finished_at, next_retry_at
        ) VALUES (?, ?, ?, 1, 'CANCELLED', NULL, ?, NULL, ?, ?, ?, ?, NULL)`,
      ).run(
        runId,
        task.id,
        task.workspace_id,
        "Skipped due to overlap policy",
        error,
        scheduledAt,
        scheduledAt,
        scheduledAt,
      );

      const nextRunAt = computeNextRunAt(
        {
          type: task.schedule_type,
          expression: task.schedule_expression,
          timezone: task.timezone,
        },
        scheduledAt,
      );

      db.query(
        "UPDATE tasks SET next_run_at = ?, last_run_at = ?, updated_at = ? WHERE id = ?",
      ).run(nextRunAt, scheduledAt, nowIso(), task.id);
    })();

    return this.getRun(runId)!;
  }

  getRunnableRuns(now: string, limit = 100): Array<TaskRun & { task_json: string }> {
    return db
      .query(
        `SELECT tr.*, json_object(
            'id', t.id,
            'workspace_id', t.workspace_id,
            'title', t.title,
            'goal', t.goal,
            'schedule_type', t.schedule_type,
            'schedule_expression', t.schedule_expression,
            'timezone', t.timezone,
            'adapter', t.adapter,
            'session_id', t.session_id,
            'input_json', t.input_json,
            'skill_ref', t.skill_ref,
            'callback_url', t.callback_url,
            'callback_headers_json', t.callback_headers_json,
            'retry_max_attempts', t.retry_max_attempts,
            'retry_backoff_base_ms', t.retry_backoff_base_ms,
            'status', t.status,
            'next_run_at', t.next_run_at,
            'last_run_at', t.last_run_at,
            'disallow_overlap', t.disallow_overlap,
            'client_request_id', t.client_request_id,
            'created_at', t.created_at,
            'updated_at', t.updated_at
        ) AS task_json
          FROM task_runs tr
          JOIN tasks t ON t.id = tr.task_id
          WHERE tr.status IN ('PENDING','RETRYING')
            AND (tr.next_retry_at IS NULL OR tr.next_retry_at <= ?)
            AND t.status = 'ACTIVE'
          ORDER BY tr.scheduled_at ASC
          LIMIT ?`,
      )
      .all(now, limit) as Array<TaskRun & { task_json: string }>;
  }

  getRun(runId: string): TaskRun | null {
    return db.query("SELECT * FROM task_runs WHERE id = ?").get(runId) as TaskRun | null;
  }

  setRunRunning(runId: string): void {
    db.query(
      "UPDATE task_runs SET status = 'RUNNING', started_at = ?, next_retry_at = NULL WHERE id = ?",
    ).run(nowIso(), runId);
  }

  markRunSuccess(runId: string, summary: string, result: Record<string, unknown>): void {
    db.query(
      "UPDATE task_runs SET status = 'SUCCEEDED', summary = ?, result_json = ?, finished_at = ? WHERE id = ?",
    ).run(summary, JSON.stringify(result), nowIso(), runId);
  }

  markRunFailure(
    runId: string,
    summary: string,
    error: { code: string; message: string; detail?: Record<string, unknown> },
  ): void {
    db.query(
      "UPDATE task_runs SET status = 'FAILED', summary = ?, error_json = ?, finished_at = ? WHERE id = ?",
    ).run(summary, JSON.stringify(error), nowIso(), runId);
  }

  markRunRetrying(runId: string, attempt: number, retryAt: string, error: object): void {
    db.query(
      "UPDATE task_runs SET status = 'RETRYING', attempt = ?, next_retry_at = ?, error_json = ? WHERE id = ?",
    ).run(attempt, retryAt, JSON.stringify(error), runId);
  }

  setRunDispatchRef(runId: string, dispatchRef: string): void {
    db.query("UPDATE task_runs SET dispatch_ref = ? WHERE id = ?").run(dispatchRef, runId);
  }

  setRunStatus(runId: string, status: RunStatus): void {
    db.query("UPDATE task_runs SET status = ? WHERE id = ?").run(status, runId);
  }
}
