import { serve } from "bun";
import { createSchedulerBridge } from "./bridge";
import { listIntegrators, resolveIntegratorModule } from "./integrators/registry";
import type { SchedulerExecuteRequest, SchedulerExecuteResponse } from "./types";

const integrator = process.env.INTEGRATOR ?? "opencode";
const integratorBaseUrl = process.env.INTEGRATOR_BASE_URL;
const sessionEndpoint = process.env.INTEGRATOR_SESSION_INGEST_URL;

const sessionToken = process.env.SESSION_POST_TOKEN;
const integratorModule = resolveIntegratorModule(integrator);
const sessionClient = integratorModule.createSessionClient({
  base_url: integratorBaseUrl,
  endpoint: sessionEndpoint,
  token: sessionToken,
});

const app = createSchedulerBridge({
  sessionClient,
  callbackAuthBearer: process.env.SCHEDULER_CALLBACK_BEARER_TOKEN,
  hooks: {
    async executeTask(req: SchedulerExecuteRequest): Promise<SchedulerExecuteResponse> {
      const payload = req.input?.payload;
      const message =
        payload &&
        typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).message === "string"
          ? ((payload as Record<string, unknown>).message as string)
          : undefined;

      return {
        status: "SUCCEEDED",
        summary: message ?? req.goal,
        result: {
          task_id: req.task_id,
          run_id: req.run_id,
          goal: req.goal,
          input: req.input ?? {},
        },
      };
    },
  },
});

const port = Number(process.env.SCHEDULER_BRIDGE_PORT ?? 9090);
serve({
  port,
  fetch: app.fetch,
});

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    msg: "scheduler-clients bridge started",
    ctx: {
      port,
      integrator: integratorModule.id,
      mode: integratorModule.mode,
      integrator_base_url: integratorBaseUrl,
      session_endpoint: sessionEndpoint,
      supported_integrators: listIntegrators(),
    },
  }),
);
