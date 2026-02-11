import { Hono } from "hono";
import { z } from "zod";
import type {
  BridgeHooks,
  SchedulerCallbackPayload,
  SchedulerExecuteRequest,
  SessionClient,
} from "./types";

const executeSchema = z.object({
  task_id: z.string().min(1),
  run_id: z.string().min(1),
  workspace_id: z.string().min(1),
  session_id: z.string().min(1),
  goal: z.string().min(1),
  skill_ref: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

const callbackSchema = z.object({
  workspace_id: z.string().min(1),
  task_id: z.string().min(1),
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  status: z.enum(["SUCCEEDED", "FAILED", "RETRYING"]),
  summary: z.string(),
  result: z.record(z.string(), z.unknown()),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      detail: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  attempt: z.number().int().min(1),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export interface BridgeOptions {
  hooks: BridgeHooks;
  sessionClient: SessionClient;
  callbackAuthBearer?: string;
}

export function createSchedulerBridge(options: BridgeOptions): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, client: options.sessionClient.kind }));

  app.post("/api/scheduler/execute", async (c) => {
    const raw = await c.req.json();
    const payload = executeSchema.safeParse(raw);
    if (!payload.success) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          msg: "bridge.execute.invalid_payload",
          ctx: {
            issues: payload.error.issues,
            payload: raw,
          },
        }),
      );
      return c.json({ error: "invalid execute payload" }, 400);
    }

    const result = await options.hooks.executeTask(payload.data as SchedulerExecuteRequest);
    return c.json(result);
  });

  app.post("/api/scheduler/callback", async (c) => {
    if (options.callbackAuthBearer) {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${options.callbackAuthBearer}`) {
        return c.json({ error: "unauthorized" }, 401);
      }
    }

    const raw = await c.req.json();
    const payload = callbackSchema.safeParse(raw);
    if (!payload.success) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          msg: "bridge.callback.invalid_payload",
          ctx: {
            issues: payload.error.issues,
            payload: raw,
          },
        }),
      );
      return c.json({ error: "invalid callback payload" }, 400);
    }

    try {
      await options.sessionClient.postMessage(
        payload.data.session_id,
        formatCallbackMessage(payload.data as SchedulerCallbackPayload),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "bridge.callback.session_post_failed",
          ctx: {
            session_id: payload.data.session_id,
            task_id: payload.data.task_id,
            run_id: payload.data.run_id,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
      return c.json({ error: "session post failed" }, 502);
    }

    return c.json({ ok: true });
  });

  return app;
}

function formatCallbackMessage(payload: SchedulerCallbackPayload) {
  const text = `[${payload.status}] ${payload.summary}`;
  return {
    text,
    metadata: {
      bridge: true,
      source: "scheduler.callback",
      task_id: payload.task_id,
      run_id: payload.run_id,
      attempt: payload.attempt,
      result: payload.result,
      error: payload.error,
    },
  };
}
