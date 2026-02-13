import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import type { SessionClient, SessionMessage } from "../../types";

const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4096";
const FORCE_NOTIFY = /(不需要回复|无需回复|不要回复|仅发送|静默发送|silent|no\s*reply|do\s*not\s*reply)/i;
const FORCE_ASK = /(需要回复|请回复|等待回复|要回复|请回答|请作答)/i;
const ASK_PATTERNS: RegExp[] = [
  /(提问|问题|请问|问下|问一下|问一问|询问|帮我问|问模型|向模型提问|向ai提问)/i,
  /(总结|概括|分析|解释|翻译|改写|润色|给出|列出|规划|判断|评估|比较|推荐)/i,
  /\b(ask|question|summarize|analyze|explain|translate|recommend)\b/i,
];
const NOTIFY_PATTERNS: RegExp[] = [
  /(回复|回答|告知|通知|播报|提醒|发送|转告|同步|推送)/i,
  /(发给我|发到会话|仅通知|只通知|定时提醒)/i,
  /\b(reply|respond|notify|push|broadcast|remind)\b/i,
];

export type OpencodeNoReplyMode = "auto" | "always_true" | "always_false";

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
  private readonly defaultNoReply: boolean;
  private readonly noReplyMode: OpencodeNoReplyMode;

  constructor(baseUrl: string, noReply: boolean, noReplyMode: OpencodeNoReplyMode) {
    this.client = createOpencodeClient({
      baseUrl,
      throwOnError: true,
      responseStyle: "data",
    });
    this.defaultNoReply = noReply;
    this.noReplyMode = noReplyMode;
  }

  async postMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const noReply = decideNoReply(message, this.defaultNoReply, this.noReplyMode);
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "opencode_sdk.post.dispatch",
        ctx: {
          session_id: sessionId,
          no_reply: noReply,
          mode: this.noReplyMode,
          preview: message.text.slice(0, 120),
        },
      }),
    );
    try {
      await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply,
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

export function createOpencodeSdk(opts: {
  baseUrl?: string;
  token?: string;
  noReply?: boolean;
  noReplyMode?: OpencodeNoReplyMode;
}) {
  const baseUrl = normalizeOpencodeBaseUrl(opts.baseUrl);
  const noReply = opts.noReply ?? true;
  const noReplyMode = opts.noReplyMode ?? "auto";
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
  return new OpencodeSessionSdk(baseUrl, noReply, noReplyMode);
}

function inferNoReplyByText(text: string, fallback: boolean): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return fallback;
  }
  if (FORCE_NOTIFY.test(normalized)) {
    return true;
  }
  if (FORCE_ASK.test(normalized)) {
    return false;
  }
  if (/[?？]$/.test(normalized)) {
    return false;
  }
  if (/(吗|么|呢)$/.test(normalized)) {
    return false;
  }

  let askScore = 0;
  let notifyScore = 0;
  for (const pattern of ASK_PATTERNS) {
    if (pattern.test(normalized)) {
      askScore += 2;
    }
  }
  for (const pattern of NOTIFY_PATTERNS) {
    if (pattern.test(normalized)) {
      notifyScore += 2;
    }
  }

  if (/请你|请帮我|帮我|麻烦你|请用/.test(normalized)) {
    askScore += 1;
  }
  if (/每\d+\s*(秒|分钟|分|小时)/.test(normalized) && /提醒/.test(normalized)) {
    notifyScore += 1;
  }

  if (askScore > notifyScore) {
    return false;
  }
  if (notifyScore > askScore) {
    return true;
  }
  return fallback;
}

export function decideNoReply(
  message: SessionMessage,
  defaultNoReply: boolean,
  mode: OpencodeNoReplyMode,
): boolean {
  if (mode === "always_true") {
    return true;
  }
  if (mode === "always_false") {
    return false;
  }

  if (typeof message.metadata?.no_reply === "boolean") {
    return message.metadata.no_reply;
  }

  return inferNoReplyByText(message.text, defaultNoReply);
}
