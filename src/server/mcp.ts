import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export async function startServer(): Promise<void> {
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
      return toMcpResponse({
        task_id: task.id,
        status: task.status,
        next_run_at: task.next_run_at,
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

  const shutdown = () => {
    scheduler.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
