import { URL } from "node:url";

export function validateCallbackUrl(callbackUrl: string): void {
  const parsed = new URL(callbackUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("callback_url must use http or https");
  }

  const allowlist = process.env.SCHEDULER_CALLBACK_ALLOWLIST;
  if (!allowlist) {
    return;
  }

  const allowedHosts = new Set(
    allowlist
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (!allowedHosts.has(parsed.host)) {
    throw new Error(`callback_url host not in allowlist: ${parsed.host}`);
  }
}
