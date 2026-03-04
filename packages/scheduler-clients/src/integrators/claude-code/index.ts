import type { IntegratorModule } from "../types";
import { createClaudeCodeSdk } from "./sdk";

export const claudeCodeIntegrator: IntegratorModule = {
  id: "claude_code",
  mode: "sdk",
  createSessionClient(config) {
    if (!config.endpoint) {
      throw new Error("INTEGRATOR_SESSION_INGEST_URL is required when INTEGRATOR=claude_code");
    }
    const endpoint = config.endpoint;
    return createClaudeCodeSdk({ endpoint, token: config.token });
  },
};
