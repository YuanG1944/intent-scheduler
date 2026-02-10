import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function hashApiKey(apiKey: string): string {
  return digest(apiKey).toString("hex");
}

export function verifyApiKey(apiKey: string, hashHex: string): boolean {
  const source = digest(apiKey);
  const target = Buffer.from(hashHex, "hex");
  if (source.length !== target.length) {
    return false;
  }
  return timingSafeEqual(source, target);
}
