import { HttpSessionSdk } from "../shared/http-session-sdk";

export function createClaudeCodeSdk(opts: { endpoint: string; token?: string }) {
  return new HttpSessionSdk({
    kind: "claude_code",
    endpoint: opts.endpoint,
    token: opts.token,
  });
}
