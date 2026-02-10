export type ScheduleType = "cron" | "interval";

export type TaskStatus = "ACTIVE" | "PAUSED" | "DELETED";
export type RunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export interface ScheduleConfig {
  type: ScheduleType;
  expression: string;
  timezone: string;
}

export interface ExecutionConfig {
  adapter: string;
  session_id: string;
  input: Record<string, unknown>;
  skill_ref?: string;
}

export interface DeliveryConfig {
  callback_url: string;
  callback_headers?: Record<string, string>;
}

export interface RetryPolicy {
  max_attempts: number;
  backoff: "exponential";
  base_delay_ms: number;
}

export interface CreateTaskInput {
  workspace_id: string;
  title: string;
  goal: string;
  schedule: ScheduleConfig;
  execution: ExecutionConfig;
  delivery: DeliveryConfig;
  retry_policy?: Partial<RetryPolicy>;
  client_request_id?: string;
  disallow_overlap?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  api_key_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  goal: string;
  schedule_type: ScheduleType;
  schedule_expression: string;
  timezone: string;
  adapter: string;
  session_id: string;
  input_json: string;
  skill_ref: string | null;
  callback_url: string;
  callback_headers_json: string | null;
  retry_max_attempts: number;
  retry_backoff_base_ms: number;
  status: TaskStatus;
  next_run_at: string;
  last_run_at: string | null;
  disallow_overlap: number;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRun {
  id: string;
  task_id: string;
  workspace_id: string;
  attempt: number;
  status: RunStatus;
  dispatch_ref: string | null;
  summary: string | null;
  result_json: string | null;
  error_json: string | null;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
}

export interface DeliveryLog {
  id: string;
  run_id: string;
  callback_url: string;
  status_code: number;
  response_body: string | null;
  delivered_at: string;
}

export interface RunExecutionResult {
  status: "SUCCEEDED" | "FAILED";
  summary: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; detail?: Record<string, unknown> };
  dispatch_ref?: string;
}
