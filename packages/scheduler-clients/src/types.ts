export interface SchedulerExecuteRequest {
  task_id: string;
  run_id: string;
  workspace_id: string;
  session_id: string;
  goal: string;
  skill_ref?: string;
  input?: Record<string, unknown>;
}

export interface SchedulerExecuteResponse {
  status: "SUCCEEDED" | "FAILED";
  summary: string;
  result?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
  error_detail?: Record<string, unknown>;
}

export interface SchedulerCallbackPayload {
  workspace_id: string;
  task_id: string;
  run_id: string;
  session_id: string;
  status: "SUCCEEDED" | "FAILED" | "RETRYING";
  summary: string;
  result: Record<string, unknown>;
  error?: { code: string; message: string; detail?: Record<string, unknown> };
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface SessionMessage {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SessionClient {
  kind: "opencode" | "claude_code" | "codex_cli" | "custom";
  postMessage(sessionId: string, message: SessionMessage): Promise<void>;
}

export interface BridgeHooks {
  executeTask(req: SchedulerExecuteRequest): Promise<SchedulerExecuteResponse>;
}
