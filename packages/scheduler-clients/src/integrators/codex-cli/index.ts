import type { IntegratorModule } from "../types";
import { createCodexCliSdk } from "./sdk";

export const codexCliIntegrator: IntegratorModule = {
  id: "codex_cli",
  mode: "sdk",
  createSessionClient(config) {
    if (!config.endpoint) {
      throw new Error("INTEGRATOR_SESSION_INGEST_URL is required when INTEGRATOR=codex_cli");
    }
    const endpoint = config.endpoint;
    return createCodexCliSdk({ endpoint, token: config.token });
  },
};
