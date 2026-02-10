import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { migrate } from '../db/schema';
import { WorkspaceRepository } from '../db/repositories/workspace-repo';
import { TaskRepository } from '../db/repositories/task-repo';
import { DeliveryRepository } from '../db/repositories/delivery-repo';
import { validateCallbackUrl } from '../utils/validation';
import { validateSchedule } from '../utils/time';
import { SchedulerService } from '../core/scheduler';
import { CallbackDelivery } from '../delivery/callback';
import { OpencodeAdapter } from '../adapters/opencode';
import { HttpJsonAdapter } from '../adapters/http-json';
import { logger } from '../utils/logger';
import type { CreateTaskInput, Task } from '../types';

const authInput = {
  workspace_id: z.string().min(1).describe('Workspace id'),
  api_key: z.string().min(1).describe('Workspace API key'),
};

const createTaskInputSchema = {
  ...authInput,
  title: z.string().min(1),
  goal: z.string().min(1),
  schedule: z.object({
    type: z.enum(['cron', 'interval']),
    expression: z.string().min(1),
    timezone: z.string().min(1),
  }),
  execution: z.object({
    adapter: z.string().min(1),
    session_id: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    skill_ref: z.string().optional(),
  }),
  delivery: z.object({
    callback_url: z.string().min(1),
    callback_headers: z.record(z.string(), z.string()).optional(),
  }),
  retry_policy: z
    .object({
      max_attempts: z.number().int().min(1).max(10).optional(),
      backoff: z.enum(['exponential']).optional(),
      base_delay_ms: z.number().int().min(100).max(3600000).optional(),
    })
    .optional(),
  client_request_id: z.string().optional(),
  disallow_overlap: z.boolean().optional(),
};

const createTaskQuickInputSchema = {
  workspace_id: z.string().min(1).optional(),
  api_key: z.string().min(1).optional(),
  goal: z.string().min(1),
  when: z.string().optional().describe('Examples: 10s, 5m, PT10S, 0 9 * * *'),
  session_id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  message: z.string().optional(),
  client_request_id: z.string().optional(),
  disallow_overlap: z.boolean().optional(),
};

const listTasksInput = {
  ...authInput,
  status: z.enum(['ACTIVE', 'PAUSED', 'DELETED']).optional(),
  adapter: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const getTaskInput = {
  ...authInput,
  task_id: z.string().min(1),
};

const listRunsInput = {
  ...authInput,
  task_id: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'CANCELLED']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

function toMcpResponse<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function parseTask(task: Task) {
  return {
    ...task,
    input: JSON.parse(task.input_json),
    callback_headers: task.callback_headers_json
      ? JSON.parse(task.callback_headers_json)
      : undefined,
  };
}

function normalizeIntervalExpression(when: string): string | null {
  const trimmed = when.trim();
  if (/^P(T.*)$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const match = trimmed.match(
    /^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)$/i,
  );
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('s')) {
    return `PT${amount}S`;
  }
  if (unit.startsWith('m')) {
    return `PT${amount}M`;
  }
  return `PT${amount}H`;
}

function parseChineseIntervalExpression(when: string): string | null {
  const raw = when.replace(/\s+/g, '');
  if (raw === '每小时' || raw === '每1小时') {
    return 'PT1H';
  }
  const match = raw.match(/^每(?:隔)?(\d+)(秒|分钟|分|小时)$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === '秒') {
    return `PT${amount}S`;
  }
  if (unit === '分钟' || unit === '分') {
    return `PT${amount}M`;
  }
  return `PT${amount}H`;
}

function parseChineseDailyCron(when: string): string | null {
  const raw = when.replace(/\s+/g, '');
  const match = raw.match(/^每天(?:(早上|上午|中午|下午|晚上))?(\d{1,2})(?:点|:|时)(?:(\d{1,2})分?)?$/);
  if (!match) {
    return null;
  }
  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  const period = match[1];
  if ((period === '下午' || period === '晚上') && hour < 12) {
    hour += 12;
  }
  if ((period === '早上' || period === '上午') && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  return `${minute} ${hour} * * *`;
}

function parseChineseWeeklyCron(when: string): string | null {
  const raw = when.replace(/\s+/g, '');
  const match = raw.match(
    /^每周([一二三四五六日天])(?:(早上|上午|中午|下午|晚上))?(\d{1,2})(?:点|:|时)(?:(\d{1,2})分?)?$/,
  );
  if (!match) {
    return null;
  }
  const dayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
  };
  const dow = dayMap[match[1]];
  let hour = Number(match[3]);
  const minute = match[4] ? Number(match[4]) : 0;
  const period = match[2];
  if ((period === '下午' || period === '晚上') && hour < 12) {
    hour += 12;
  }
  if ((period === '早上' || period === '上午') && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  return `${minute} ${hour} * * ${dow}`;
}

function parseQuickSchedule(when: string | undefined, timezone: string) {
  const raw = (when ?? '10s').trim();
  const interval = normalizeIntervalExpression(raw) ?? parseChineseIntervalExpression(raw);
  if (interval) {
    return {
      type: 'interval' as const,
      expression: interval,
      timezone,
    };
  }

  const cronParts = raw.split(/\s+/).filter(Boolean);
  if (cronParts.length === 5) {
    return {
      type: 'cron' as const,
      expression: raw,
      timezone,
    };
  }

  const dailyCron = parseChineseDailyCron(raw);
  if (dailyCron) {
    return {
      type: 'cron' as const,
      expression: dailyCron,
      timezone,
    };
  }

  const weeklyCron = parseChineseWeeklyCron(raw);
  if (weeklyCron) {
    return {
      type: 'cron' as const,
      expression: weeklyCron,
      timezone,
    };
  }

  throw new Error(
    "Unsupported `when`. Use one of: 10s / 5m / 1h / PT10S / `0 9 * * *` / 每10秒 / 每天9点 / 每周一早上9点",
  );
}

function scanSessionIdFromUnknown(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const queue: unknown[] = [input];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') {
      continue;
    }
    const obj = node as Record<string, unknown>;
    const directKeys = ['session_id', 'sessionId', 'sessionID', 'conversation_id', 'conversationId'];
    for (const key of directKeys) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }
  return undefined;
}

function resolveWorkspaceAndApiKey(
  workspaceId?: string,
  apiKey?: string,
): { workspaceId: string; apiKey: string } {
  const resolvedWorkspaceId =
    workspaceId ?? process.env.SCHEDULER_DEFAULT_WORKSPACE_ID ?? 'opencode-prod';
  const resolvedApiKey = apiKey ?? process.env.SCHEDULER_DEFAULT_API_KEY;
  if (!resolvedApiKey) {
    throw new Error(
      'api_key is required. Provide api_key in tool input or set SCHEDULER_DEFAULT_API_KEY.',
    );
  }
  return {
    workspaceId: resolvedWorkspaceId,
    apiKey: resolvedApiKey,
  };
}

function resolveSessionId(
  explicitSessionId: string | undefined,
  extra?: RequestHandlerExtra<ServerRequest, ServerNotification>,
): string {
  if (explicitSessionId) {
    return explicitSessionId;
  }
  const metaSessionId = scanSessionIdFromUnknown(extra?._meta);
  if (metaSessionId) {
    return metaSessionId;
  }
  const requestInfoSessionId = scanSessionIdFromUnknown(extra?.requestInfo);
  if (requestInfoSessionId) {
    return requestInfoSessionId;
  }
  const candidates = [
    process.env.SCHEDULER_DEFAULT_SESSION_ID,
    process.env.CURRENT_SESSION_ID,
    process.env.OPENCODE_SESSION_ID,
    process.env.SESSION_ID,
  ].filter(Boolean) as string[];

  if (candidates.length > 0) {
    return candidates[0];
  }

  throw new Error(
    'session_id is required. If omitted, set one of env vars: SCHEDULER_DEFAULT_SESSION_ID / CURRENT_SESSION_ID / OPENCODE_SESSION_ID / SESSION_ID',
  );
}

export async function startServer(): Promise<void> {
  logger.info('server.booting');
  migrate();

  const workspaceRepo = new WorkspaceRepository();
  const taskRepo = new TaskRepository();
  const deliveryRepo = new DeliveryRepository();
  const callbackDelivery = new CallbackDelivery(deliveryRepo);
  const adapters = new Map([
    ['http_json', new HttpJsonAdapter('http_json')],
    ['opencode', new OpencodeAdapter()],
  ]);
  const scheduler = new SchedulerService(taskRepo, callbackDelivery, adapters, {
    tickMs: Number(process.env.SCHEDULER_TICK_MS ?? 30_000),
  });
  logger.info('server.adapters.ready', { adapters: Array.from(adapters.keys()) });

  const server = new McpServer({
    name: 'intent-scheduler-mcp',
    version: '0.1.0',
  });

  function assertAuth(workspaceId: string, apiKey: string): void {
    if (!workspaceRepo.verifyWorkspaceApiKey(workspaceId, apiKey)) {
      throw new Error('Unauthorized workspace_id/api_key');
    }
  }

  server.registerTool(
    'scheduler_upsert_workspace',
    {
      description: 'Create or rotate a workspace API key',
      inputSchema: {
        workspace_id: z.string().min(1),
        name: z.string().min(1),
        api_key: z.string().min(8),
        admin_token: z.string().min(1),
      },
    },
    async ({ workspace_id, name, api_key, admin_token }) => {
      const expected = process.env.SCHEDULER_ADMIN_TOKEN;
      if (!expected || admin_token !== expected) {
        throw new Error('admin_token is invalid or server SCHEDULER_ADMIN_TOKEN is not set');
      }

      const workspace = workspaceRepo.upsertWorkspace(workspace_id, name, api_key);
      logger.info('tool.scheduler_upsert_workspace', { workspace_id: workspace.id });
      return toMcpResponse({ workspace_id: workspace.id, name: workspace.name, status: 'OK' });
    }
  );

  server.registerTool(
    'scheduler_create_task',
    {
      description:
        'Create a scheduled task. external_only mode: execution is delegated to adapter.',
      inputSchema: createTaskInputSchema,
    },
    async input => {
      assertAuth(input.workspace_id, input.api_key);
      validateSchedule(input.schedule);
      validateCallbackUrl(input.delivery.callback_url);
      if (!adapters.has(input.execution.adapter)) {
        throw new Error(
          `Unknown adapter: ${input.execution.adapter}. Available adapters: ${Array.from(adapters.keys()).join(', ')}`,
        );
      }

      const createInput: CreateTaskInput = {
        workspace_id: input.workspace_id,
        title: input.title,
        goal: input.goal,
        schedule: input.schedule,
        execution: input.execution,
        delivery: input.delivery,
        retry_policy: input.retry_policy,
        client_request_id: input.client_request_id,
        disallow_overlap: input.disallow_overlap,
      };

      const task = taskRepo.createTask(createInput);
      logger.info('tool.scheduler_create_task', {
        workspace_id: task.workspace_id,
        task_id: task.id,
        adapter: task.adapter,
      });
      return toMcpResponse({
        task_id: task.id,
        status: task.status,
        next_run_at: task.next_run_at,
      });
    }
  );

  server.registerTool(
    'scheduler_create_task_quick',
    {
      description:
        'Quick create with defaults. session_id is optional and falls back to current-session env vars.',
      inputSchema: createTaskQuickInputSchema,
    },
    async (input, extra) => {
      const auth = resolveWorkspaceAndApiKey(input.workspace_id, input.api_key);
      assertAuth(auth.workspaceId, auth.apiKey);

      const timezone = input.timezone ?? process.env.SCHEDULER_DEFAULT_TIMEZONE ?? 'Asia/Shanghai';
      const schedule = parseQuickSchedule(input.when, timezone);
      validateSchedule(schedule);

      const executionEndpoint =
        process.env.SCHEDULER_DEFAULT_EXECUTE_ENDPOINT ??
        'http://127.0.0.1:9090/api/scheduler/execute';
      const callbackUrl =
        process.env.SCHEDULER_DEFAULT_CALLBACK_URL ??
        'http://127.0.0.1:9090/api/scheduler/callback';
      validateCallbackUrl(callbackUrl);

      const sessionId = resolveSessionId(input.session_id, extra);
      const title = input.title ?? input.goal.slice(0, 24);
      const message = input.message ?? input.goal;

      const createInput: CreateTaskInput = {
        workspace_id: auth.workspaceId,
        title,
        goal: input.goal,
        schedule,
        execution: {
          adapter: 'http_json',
          session_id: sessionId,
          input: {
            endpoint: executionEndpoint,
            method: 'POST',
            timeout_ms: 30000,
            payload: { message },
          },
        },
        delivery: {
          callback_url: callbackUrl,
        },
        retry_policy: {
          max_attempts: 3,
          backoff: 'exponential',
          base_delay_ms: 60000,
        },
        client_request_id: input.client_request_id,
        disallow_overlap: input.disallow_overlap ?? true,
      };

      const task = taskRepo.createTask(createInput);
      logger.info('tool.scheduler_create_task_quick', {
        workspace_id: task.workspace_id,
        task_id: task.id,
        session_id: sessionId,
      });
      return toMcpResponse({
        task_id: task.id,
        status: task.status,
        next_run_at: task.next_run_at,
        session_id: sessionId,
      });
    }
  );

  server.registerTool(
    'scheduler_list_tasks',
    {
      description: 'List tasks in a workspace',
      inputSchema: listTasksInput,
    },
    async ({ workspace_id, api_key, status, adapter, limit, cursor }) => {
      assertAuth(workspace_id, api_key);
      const result = taskRepo.listTasks(workspace_id, { status, adapter, limit, cursor });
      return toMcpResponse({
        tasks: result.tasks.map(parseTask),
        next_cursor: result.nextCursor,
      });
    }
  );

  server.registerTool(
    'scheduler_get_task',
    {
      description: 'Get one task and latest run',
      inputSchema: getTaskInput,
    },
    async ({ workspace_id, api_key, task_id }) => {
      assertAuth(workspace_id, api_key);
      const task = taskRepo.getTask(workspace_id, task_id);
      if (!task) {
        throw new Error('Task not found');
      }
      const latestRun = taskRepo.getLatestRun(task_id);
      return toMcpResponse({ task: parseTask(task), latest_run: latestRun });
    }
  );

  server.registerTool(
    'scheduler_pause_task',
    {
      description: 'Pause a task',
      inputSchema: getTaskInput,
    },
    async ({ workspace_id, api_key, task_id }) => {
      assertAuth(workspace_id, api_key);
      const task = taskRepo.updateTaskStatus(workspace_id, task_id, 'PAUSED');
      if (!task) {
        throw new Error('Task not found');
      }
      return toMcpResponse({
        task_id: task.id,
        status: task.status,
        next_run_at: task.next_run_at,
      });
    }
  );

  server.registerTool(
    'scheduler_resume_task',
    {
      description: 'Resume a task',
      inputSchema: getTaskInput,
    },
    async ({ workspace_id, api_key, task_id }) => {
      assertAuth(workspace_id, api_key);
      const task = taskRepo.updateTaskStatus(workspace_id, task_id, 'ACTIVE');
      if (!task) {
        throw new Error('Task not found');
      }
      return toMcpResponse({
        task_id: task.id,
        status: task.status,
        next_run_at: task.next_run_at,
      });
    }
  );

  server.registerTool(
    'scheduler_delete_task',
    {
      description: 'Soft-delete a task',
      inputSchema: getTaskInput,
    },
    async ({ workspace_id, api_key, task_id }) => {
      assertAuth(workspace_id, api_key);
      const task = taskRepo.updateTaskStatus(workspace_id, task_id, 'DELETED');
      if (!task) {
        throw new Error('Task not found');
      }
      return toMcpResponse({ task_id: task.id, status: 'DELETED' });
    }
  );

  server.registerTool(
    'scheduler_run_task_now',
    {
      description: 'Create an immediate run for a task',
      inputSchema: getTaskInput,
    },
    async ({ workspace_id, api_key, task_id }) => {
      assertAuth(workspace_id, api_key);
      const task = taskRepo.getTask(workspace_id, task_id);
      if (!task) {
        throw new Error('Task not found');
      }
      const run = await scheduler.runTaskNow(task);
      logger.info('tool.scheduler_run_task_now', {
        workspace_id,
        task_id,
        run_id: run.id,
      });
      return toMcpResponse({
        run_id: run.id,
        task_id: task.id,
        status: run.status,
        scheduled_at: run.scheduled_at,
      });
    }
  );

  server.registerTool(
    'scheduler_list_runs',
    {
      description: 'List runs for a workspace',
      inputSchema: listRunsInput,
    },
    async ({ workspace_id, api_key, task_id, status, limit, cursor }) => {
      assertAuth(workspace_id, api_key);
      if (task_id) {
        const task = taskRepo.getTask(workspace_id, task_id);
        if (!task) {
          throw new Error('task_id is not in this workspace');
        }
      }
      const result = taskRepo.listRuns(workspace_id, {
        task_id,
        status,
        limit,
        cursor,
      });
      return toMcpResponse({ runs: result.runs, next_cursor: result.nextCursor });
    }
  );

  scheduler.start();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('server.started', { transport: 'stdio' });

  let shuttingDown = false;
  const shutdown = (reason: string, details?: Record<string, unknown>, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn('server.shutdown', { reason, ...(details ?? {}) });
    scheduler.stop();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => shutdown('signal', { signal: 'SIGINT' }));
  process.on('SIGTERM', () => shutdown('signal', { signal: 'SIGTERM' }));
  process.on('SIGHUP', () => shutdown('signal', { signal: 'SIGHUP' }));

  process.on('uncaughtException', (error) => {
    logger.error('server.uncaught_exception', {
      message: error.message,
      stack: error.stack,
    });
    shutdown('uncaughtException', { message: error.message }, 1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('server.unhandled_rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    shutdown(
      'unhandledRejection',
      { reason: reason instanceof Error ? reason.message : String(reason) },
      1,
    );
  });

  process.on('beforeExit', (code) => {
    logger.info('server.before_exit', { code });
  });

  process.on('exit', (code) => {
    // Keep this as plain stderr to survive late-exit logger buffering.
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'server.exit',
        ctx: { code },
      }),
    );
  });
}
