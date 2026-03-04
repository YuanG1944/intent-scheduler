import { describe, expect, test } from "bun:test";
import { createSchedulerBridge } from "../src/bridge";
import type { SessionClient } from "../src/types";

class MockSessionClient implements SessionClient {
  kind: SessionClient["kind"] = "custom";
  calls: Array<{ sessionId: string; text: string; metadata?: Record<string, unknown> }> = [];

  async postMessage(
    sessionId: string,
    message: { text: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    this.calls.push({ sessionId, text: message.text, metadata: message.metadata });
  }
}

describe("scheduler bridge", () => {
  test("accepts execute payload with skill_ref=null", async () => {
    const client = new MockSessionClient();
    const app = createSchedulerBridge({
      sessionClient: client,
      hooks: {
        async executeTask() {
          return { status: "SUCCEEDED", summary: "ok", result: {} };
        },
      },
    });

    const response = await app.request("/api/scheduler/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task_id: "task1",
        run_id: "run1",
        workspace_id: "ws1",
        session_id: "sess1",
        goal: "hello",
        skill_ref: null,
        input: {},
      }),
    });

    expect(response.status).toBe(200);
  });

  test("accepts callback and pushes message", async () => {
    const client = new MockSessionClient();
    const app = createSchedulerBridge({
      sessionClient: client,
      hooks: {
        async executeTask() {
          return { status: "SUCCEEDED", summary: "ok", result: {} };
        },
      },
    });

    const response = await app.request("/api/scheduler/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws1",
        task_id: "task1",
        run_id: "run1",
        session_id: "sess1",
        status: "SUCCEEDED",
        summary: "done",
        result: {},
        attempt: 1,
        started_at: null,
        finished_at: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(client.calls.length).toBe(1);
    expect(client.calls[0].sessionId).toBe("sess1");
    expect(client.calls[0].text).toBe("done");
  });

  test("propagates no_reply metadata from callback result", async () => {
    const client = new MockSessionClient();
    const app = createSchedulerBridge({
      sessionClient: client,
      hooks: {
        async executeTask() {
          return { status: "SUCCEEDED", summary: "ok", result: {} };
        },
      },
    });

    const response = await app.request("/api/scheduler/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws1",
        task_id: "task1",
        run_id: "run1",
        session_id: "sess1",
        status: "SUCCEEDED",
        summary: "done",
        result: { no_reply: true },
        attempt: 1,
        started_at: null,
        finished_at: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(client.calls.length).toBe(1);
    expect(client.calls[0].metadata?.no_reply).toBe(true);
  });
});
