import type { RunExecutionResult, Task, TaskRun } from "../types";

export interface DispatchContext {
  task: Task;
  run: TaskRun;
}

export interface DispatchResult extends RunExecutionResult {
  dispatch_ref?: string;
}

export interface PollResult {
  done: boolean;
  result?: DispatchResult;
}

export interface ExternalAdapter {
  name: string;
  dispatch(ctx: DispatchContext): Promise<DispatchResult>;
  poll?(dispatchRef: string): Promise<PollResult>;
  cancel?(dispatchRef: string): Promise<void>;
}
