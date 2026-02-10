import { describe, expect, test } from "bun:test";
import { hashApiKey, verifyApiKey } from "../src/auth/apikey";

describe("apikey hash/verify", () => {
  test("verifies matching key", () => {
    const hash = hashApiKey("secret-123");
    expect(verifyApiKey("secret-123", hash)).toBe(true);
    expect(verifyApiKey("other", hash)).toBe(false);
  });
});
