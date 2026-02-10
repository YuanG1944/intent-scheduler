import { TaskRepository } from "../db/repositories/task-repo";
import { CallbackDelivery } from "../delivery/callback";
import { computeRetryAt, nowIso } from "../utils/time";
import type { Task, TaskRun } from "../types";
import type { ExternalAdapter } from "../adapters/types";

export interface SchedulerOptions {
  tickMs?: number;
}

export class SchedulerService {
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly delivery: CallbackDelivery,
    private readonly adapters: Map<string, ExternalAdapter>,
    options?: SchedulerOptions,
  ) {
    this.tickMs = options?.tickMs ?? 30_000;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const now = nowIso();
      const dueTasks = this.taskRepo.getDueTasks(now);
      for (const task of dueTasks) {
        await this.enqueueDueTask(task, now);
      }

      const runnable = this.taskRepo.getRunnableRuns(now);
      for (const row of runnable) {
        const task = JSON.parse(row.task_json) as Task;
        await this.executeRun(task, row);
      }
    } finally {
      this.ticking = false;
    }
  }

  async runTaskNow(task: Task): Promise<TaskRun> {
    return this.taskRepo.createImmediateRun(task);
  }

  private async enqueueDueTask(task: Task, scheduledAt: string): Promise<void> {
    if (task.disallow_overlap === 1 && this.taskRepo.hasActiveRun(task.id)) {
      const skipped = this.taskRepo.createOverlapSkippedRun(task, scheduledAt);
      await this.emitCallback(task, skipped, "CANCELLED");
      return;
    }
    this.taskRepo.scheduleTaskRun(task, scheduledAt);
  }

  private async executeRun(task: Task, run: TaskRun): Promise<void> {
    const adapter = this.adapters.get(task.adapter);
    if (!adapter) {
      this.taskRepo.markRunFailure(run.id, "Adapter not found", {
        code: "ADAPTER_NOT_FOUND",
        message: `No adapter registered for ${task.adapter}`,
      });
      const failedRun = this.taskRepo.getRun(run.id);
      if (failedRun) {
        await this.emitCallback(task, failedRun, "FAILED");
      }
      return;
    }

    this.taskRepo.setRunRunning(run.id);
    const running = this.taskRepo.getRun(run.id);
    if (!running) {
      return;
    }

    const result = await adapter.dispatch({ task, run: running });
    if (result.dispatch_ref) {
      this.taskRepo.setRunDispatchRef(run.id, result.dispatch_ref);
    }

    if (result.status === "SUCCEEDED") {
      this.taskRepo.markRunSuccess(run.id, result.summary, result.result ?? {});
      const succeeded = this.taskRepo.getRun(run.id);
      if (succeeded) {
        await this.emitCallback(task, succeeded, "SUCCEEDED");
      }
      return;
    }

    const attempt = running.attempt;
    if (attempt < task.retry_max_attempts) {
      const nextAttempt = attempt + 1;
      const retryAt = computeRetryAt(task.retry_backoff_base_ms, attempt);
      this.taskRepo.markRunRetrying(
        run.id,
        nextAttempt,
        retryAt,
        result.error ?? { code: "EXECUTION_FAILED", message: result.summary },
      );
      const retrying = this.taskRepo.getRun(run.id);
      if (retrying) {
        await this.emitCallback(task, retrying, "RETRYING");
      }
      return;
    }

    this.taskRepo.markRunFailure(run.id, result.summary, {
      code: result.error?.code ?? "EXECUTION_FAILED",
      message: result.error?.message ?? result.summary,
      detail: result.error?.detail,
    });
    const failed = this.taskRepo.getRun(run.id);
    if (failed) {
      await this.emitCallback(task, failed, "FAILED");
    }
  }

  private async emitCallback(
    task: Task,
    run: TaskRun,
    status: "SUCCEEDED" | "FAILED" | "RETRYING" | "CANCELLED",
  ): Promise<void> {
    const callbackHeaders = task.callback_headers_json
      ? (JSON.parse(task.callback_headers_json) as Record<string, string>)
      : {};

    const authToken = process.env.SCHEDULER_CALLBACK_BEARER_TOKEN;
    if (authToken && !callbackHeaders.Authorization) {
      callbackHeaders.Authorization = `Bearer ${authToken}`;
    }

    if (status === "CANCELLED") {
      // Overlap-cancelled events are audit-only by default.
      return;
    }

    await this.delivery.deliver(task.callback_url, callbackHeaders, {
      workspace_id: task.workspace_id,
      task_id: task.id,
      run_id: run.id,
      session_id: task.session_id,
      status,
      summary: run.summary ?? status,
      result: run.result_json ? (JSON.parse(run.result_json) as Record<string, unknown>) : {},
      error: run.error_json
        ? (JSON.parse(run.error_json) as {
            code: string;
            message: string;
            detail?: Record<string, unknown>;
          })
        : undefined,
      attempt: run.attempt,
      started_at: run.started_at,
      finished_at: run.finished_at,
    });
  }
}
