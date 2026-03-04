import { serve } from "bun";
import { createSchedulerBridge } from "./bridge";
import { listIntegrators, resolveIntegratorModule } from "./integrators/registry";
import type { OpencodeNoReplyMode } from "./integrators/opencode/sdk";
import type { SchedulerExecuteRequest, SchedulerExecuteResponse } from "./types";

const integrator = process.env.INTEGRATOR ?? "opencode";
const integratorBaseUrl = process.env.INTEGRATOR_BASE_URL;
const sessionEndpoint = process.env.INTEGRATOR_SESSION_INGEST_URL;

const sessionToken = process.env.SESSION_POST_TOKEN;
const opencodeNoReply = process.env.OPENCODE_NO_REPLY?.toLowerCase() !== "false";
const opencodeNoReplyMode = normalizeNoReplyMode(process.env.OPENCODE_NO_REPLY_MODE);
const integratorModule = resolveIntegratorModule(integrator);
const sessionClient = integratorModule.createSessionClient({
  base_url: integratorBaseUrl,
  endpoint: sessionEndpoint,
  token: sessionToken,
  no_reply: opencodeNoReply,
  no_reply_mode: opencodeNoReplyMode,
});

const app = createSchedulerBridge({
  sessionClient,
  callbackAuthBearer: process.env.SCHEDULER_CALLBACK_BEARER_TOKEN,
  hooks: {
    async executeTask(req: SchedulerExecuteRequest): Promise<SchedulerExecuteResponse> {
      const payload =
        req.input?.payload && typeof req.input.payload === "object"
          ? (req.input.payload as Record<string, unknown>)
          : undefined;
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : typeof req.input?.message === "string"
            ? req.input.message
            : undefined;
      const summary = message ?? req.goal;
      const explicitNoReply = getExplicitNoReply(req.input, payload);
      const inferredNoReply = inferNoReply(summary, opencodeNoReply);
      const noReply = explicitNoReply ?? inferredNoReply;

      return {
        status: "SUCCEEDED",
        summary,
        result: {
          task_id: req.task_id,
          run_id: req.run_id,
          goal: req.goal,
          no_reply: noReply,
          no_reply_source: explicitNoReply == null ? "inferred" : "explicit",
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
      opencode_no_reply: opencodeNoReply,
      opencode_no_reply_mode: opencodeNoReplyMode,
      supported_integrators: listIntegrators(),
    },
  }),
);

function normalizeNoReplyMode(raw?: string): OpencodeNoReplyMode {
  const value = (raw ?? "auto").trim().toLowerCase();
  if (value === "always_true" || value === "always_false" || value === "auto") {
    return value;
  }
  return "auto";
}

function getExplicitNoReply(
  input?: Record<string, unknown>,
  payload?: Record<string, unknown>,
): boolean | undefined {
  const candidates = [input?.no_reply, payload?.no_reply, input?.noReply, payload?.noReply];
  for (const value of candidates) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function inferNoReply(text: string, fallback: boolean): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return fallback;
  }
  if (/(不需要回复|无需回复|不要回复|仅发送|静默发送|silent|no\s*reply|do\s*not\s*reply)/i.test(normalized)) {
    return true;
  }
  if (/(需要回复|请回复|等待回复|要回复|请回答|请作答|need reply|please reply|wait for response)/i.test(normalized)) {
    return false;
  }
  if (/[?？]$/.test(normalized) || /(吗|么|呢)$/.test(normalized)) {
    return false;
  }
  if (/(提问|问题|请问|询问|总结|分析|解释|翻译|推荐|ask|question|summarize|analyze|explain|translate|recommend)/i.test(normalized)) {
    return false;
  }
  if (/(通知|提醒|发送|推送|转告|notify|remind|send|push|broadcast)/i.test(normalized)) {
    return true;
  }
  return fallback;
}
