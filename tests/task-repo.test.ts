import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";

describe("task repository", () => {
  test("supports task idempotency and listing", async () => {
    const dbPath = join(process.cwd(), "tmp-test-intent-scheduler.db");
    process.env.SCHEDULER_DB_PATH = dbPath;

    const { migrate } = await import("../src/db/schema");
    const { WorkspaceRepository } = await import("../src/db/repositories/workspace-repo");
    const { TaskRepository } = await import("../src/db/repositories/task-repo");

    migrate();
    const workspaces = new WorkspaceRepository();
    const tasks = new TaskRepository();

    workspaces.upsertWorkspace("ws-1", "Workspace 1", "api-key-12345678");

    const input = {
      workspace_id: "ws-1",
      title: "Daily report",
      goal: "Generate report",
      schedule: { type: "interval" as const, expression: "PT5M", timezone: "UTC" },
      execution: {
        adapter: "opencode",
        session_id: "sess-1",
        input: { endpoint: "https://example.com/execute" },
      },
      delivery: { callback_url: "https://example.com/callback" },
      client_request_id: "req-001",
    };

    const a = tasks.createTask(input);
    const b = tasks.createTask(input);

    expect(a.id).toBe(b.id);

    const listed = tasks.listTasks("ws-1", {});
    expect(listed.tasks.length).toBe(1);

    rmSync(dbPath, { force: true });
  });
});
