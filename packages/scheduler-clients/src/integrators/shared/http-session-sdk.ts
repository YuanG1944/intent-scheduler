import type { SessionClient, SessionMessage } from "../../types";

export interface HttpSessionSdkOptions {
  kind: SessionClient["kind"];
  endpoint: string;
  token?: string;
  timeoutMs?: number;
}

export class HttpSessionSdk implements SessionClient {
  readonly kind: SessionClient["kind"];

  constructor(private readonly options: HttpSessionSdkOptions) {
    this.kind = options.kind;
  }

  async postMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);

    try {
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: message.text,
          metadata: message.metadata ?? {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "error",
            msg: "session_client.post.non_2xx",
            ctx: {
              kind: this.options.kind,
              endpoint: this.options.endpoint,
              session_id: sessionId,
              status: response.status,
              body: text,
            },
          }),
        );
        throw new Error(`session post failed (${response.status}): ${text}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
