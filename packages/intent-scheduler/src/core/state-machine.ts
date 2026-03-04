import type { RunStatus } from "../types";

const allowedTransitions: Record<RunStatus, RunStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "RETRYING"],
  RETRYING: ["RUNNING", "FAILED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid run status transition: ${from} -> ${to}`);
  }
}
