import type { DispatchContext, DispatchResult, ExternalAdapter } from "./types";

interface HttpJsonInput {
  endpoint: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  timeout_ms?: number;
  payload?: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export class HttpJsonAdapter implements ExternalAdapter {
  constructor(public readonly name: string = "http_json") {}

  async dispatch(ctx: DispatchContext): Promise<DispatchResult> {
    const input = asObject(JSON.parse(ctx.task.input_json)) as unknown as HttpJsonInput;
    if (!input.endpoint || typeof input.endpoint !== "string") {
      return {
        status: "FAILED",
        summary: `${this.name} adapter missing execution.input.endpoint`,
        error: {
          code: "INVALID_EXECUTION_INPUT",
          message: "execution.input.endpoint is required",
        },
      };
    }

    const controller = new AbortController();
    const timeoutMs = typeof input.timeout_ms === "number" ? input.timeout_ms : 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const requestBody: Record<string, unknown> = {
      task_id: ctx.task.id,
      run_id: ctx.run.id,
      workspace_id: ctx.task.workspace_id,
      session_id: ctx.task.session_id,
      goal: ctx.task.goal,
      skill_ref: ctx.task.skill_ref,
      input: input.payload ?? asObject(input),
    };

    try {
      const response = await fetch(input.endpoint, {
        method: input.method ?? "POST",
        headers: {
          "content-type": "application/json",
          ...(input.headers ?? {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const rawText = await response.text();
      const parsed = rawText ? safeParseJson(rawText) : undefined;

      if (!response.ok) {
        return {
          status: "FAILED",
          summary: `${this.name} executor returned ${response.status}`,
          error: {
            code: "EXECUTION_HTTP_ERROR",
            message: rawText || response.statusText,
            detail: { status: response.status },
          },
        };
      }

      if (parsed && typeof parsed === "object") {
        const status = parsed.status === "FAILED" ? "FAILED" : "SUCCEEDED";
        return {
          status,
          summary: asString(parsed.summary) ?? "Execution completed",
          result: asObject(parsed.result ?? parsed),
          error:
            status === "FAILED"
              ? {
                  code: asString(parsed.error_code) ?? "EXECUTION_FAILED",
                  message: asString(parsed.error_message) ?? "Execution failed",
                  detail: asObject(parsed.error_detail),
                }
              : undefined,
          dispatch_ref: asString(parsed.dispatch_ref),
        };
      }

      return {
        status: "SUCCEEDED",
        summary: rawText ? rawText.slice(0, 500) : "Execution completed",
        result: { raw: rawText },
      };
    } catch (error) {
      return {
        status: "FAILED",
        summary: `${this.name} adapter dispatch failed`,
        error: {
          code: "ADAPTER_DISPATCH_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
