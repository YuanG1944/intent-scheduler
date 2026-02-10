import type { SessionClient } from "../types";

export type IntegratorId = "opencode" | "claude_code" | "codex_cli" | "others";

export interface IntegratorRuntimeConfig {
  base_url?: string;
  endpoint?: string;
  token?: string;
}

export interface IntegratorModule {
  id: IntegratorId;
  mode: "sdk" | "http";
  createSessionClient(config: IntegratorRuntimeConfig): SessionClient;
}
