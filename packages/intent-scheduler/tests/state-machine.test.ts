import { describe, expect, test } from "bun:test";
import { assertTransition, canTransition } from "../src/core/state-machine";

describe("state transitions", () => {
  test("allows pending to running", () => {
    expect(canTransition("PENDING", "RUNNING")).toBe(true);
  });

  test("rejects succeeded to running", () => {
    expect(canTransition("SUCCEEDED", "RUNNING")).toBe(false);
    expect(() => assertTransition("SUCCEEDED", "RUNNING")).toThrow();
  });
});
