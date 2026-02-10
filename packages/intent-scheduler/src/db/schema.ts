import { db } from "./client";

export function migrate(): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron','interval')),
  schedule_expression TEXT NOT NULL,
  timezone TEXT NOT NULL,
  adapter TEXT NOT NULL,
  session_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  skill_ref TEXT,
  callback_url TEXT NOT NULL,
  callback_headers_json TEXT,
  retry_max_attempts INTEGER NOT NULL DEFAULT 3,
  retry_backoff_base_ms INTEGER NOT NULL DEFAULT 60000,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','PAUSED','DELETED')),
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  disallow_overlap INTEGER NOT NULL DEFAULT 1,
  client_request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency
  ON tasks(workspace_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON tasks(workspace_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYING','CANCELLED')),
  dispatch_ref TEXT,
  summary TEXT,
  result_json TEXT,
  error_json TEXT,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  next_retry_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks (id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
);

CREATE INDEX IF NOT EXISTS idx_runs_pending
  ON task_runs(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_runs_task
  ON task_runs(task_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT,
  delivered_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES task_runs (id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_run
  ON delivery_logs(run_id, delivered_at DESC);
`);
}
