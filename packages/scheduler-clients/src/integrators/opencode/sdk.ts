import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import type { SessionClient, SessionMessage } from "../../types";

const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4096";

function normalizeOpencodeBaseUrl(raw?: string): string {
  if (!raw) {
    return DEFAULT_OPENCODE_BASE_URL;
  }
  const url = new URL(raw);
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`.replace(/\/+$/, "");
}

class OpencodeSessionSdk implements SessionClient {
  readonly kind = "opencode" as const;
  private readonly client: OpencodeClient;

  constructor(baseUrl: string) {
    this.client = createOpencodeClient({
      baseUrl,
      throwOnError: true,
      responseStyle: "data",
    });
  }

  async postMessage(sessionId: string, message: SessionMessage): Promise<void> {
    try {
      await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply: true,
          parts: [
            {
              type: "text",
              text: message.text,
              metadata: message.metadata ?? {},
            },
          ],
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "opencode_sdk.post.failed",
          ctx: {
            session_id: sessionId,
            error: errorMessage,
          },
        }),
      );
      throw new Error(`opencode sdk post failed: ${errorMessage}`);
    }
  }
}

export function createOpencodeSdk(opts: { baseUrl?: string; token?: string }) {
  const baseUrl = normalizeOpencodeBaseUrl(opts.baseUrl);
  if (opts.token) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        msg: "opencode_sdk.token_ignored",
        ctx: {
          reason: "SESSION_POST_TOKEN is not used by @opencode-ai/sdk client",
        },
      }),
    );
  }
  return new OpencodeSessionSdk(baseUrl);
}
