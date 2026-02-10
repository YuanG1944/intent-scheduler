import type { IntegratorModule } from "../types";
import { createOthersHttpSdk } from "./http-sdk";

export const othersIntegrator: IntegratorModule = {
  id: "others",
  mode: "http",
  createSessionClient(config) {
    if (!config.endpoint) {
      throw new Error("INTEGRATOR_SESSION_INGEST_URL is required when INTEGRATOR=others");
    }
    return createOthersHttpSdk({
      endpoint: config.endpoint,
      token: config.token,
    });
  },
};
