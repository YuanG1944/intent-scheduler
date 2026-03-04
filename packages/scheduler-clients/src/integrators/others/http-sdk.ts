import { HttpSessionSdk } from "../shared/http-session-sdk";

export function createOthersHttpSdk(opts: { endpoint: string; token?: string }) {
  return new HttpSessionSdk({
    kind: "custom",
    endpoint: opts.endpoint,
    token: opts.token,
  });
}
