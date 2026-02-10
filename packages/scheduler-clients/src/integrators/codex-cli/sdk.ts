import { HttpSessionSdk } from "../shared/http-session-sdk";

export function createCodexCliSdk(opts: { endpoint: string; token?: string }) {
  return new HttpSessionSdk({
    kind: "codex_cli",
    endpoint: opts.endpoint,
    token: opts.token,
  });
}
