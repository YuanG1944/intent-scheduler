import type { IntegratorModule } from "../types";
import { createOpencodeSdk } from "./sdk";

export const opencodeIntegrator: IntegratorModule = {
  id: "opencode",
  mode: "sdk",
  createSessionClient(config) {
    return createOpencodeSdk({
      baseUrl: config.base_url,
      token: config.token,
      noReply: config.no_reply,
      noReplyMode: config.no_reply_mode,
    });
  },
};
