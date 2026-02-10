import { describe, expect, test } from "bun:test";
import { computeNextRunAt, computeRetryAt, validateSchedule } from "../src/utils/time";

describe("time utilities", () => {
  test("validates cron schedule", () => {
    expect(() =>
      validateSchedule({ type: "cron", expression: "*/5 * * * *", timezone: "Asia/Shanghai" }),
    ).not.toThrow();
  });

  test("computes next interval run", () => {
    const next = computeNextRunAt(
      { type: "interval", expression: "PT5M", timezone: "UTC" },
      "2026-02-10T00:00:00.000Z",
    );
    expect(next).toBe("2026-02-10T00:05:00.000Z");
  });

  test("computes retry delay exponentially by factor 3", () => {
    const retry = computeRetryAt(60000, 2, "2026-02-10T00:00:00.000Z");
    expect(retry).toBe("2026-02-10T00:03:00.000Z");
  });
});
