import { DeliveryRepository } from "../db/repositories/delivery-repo";

interface CallbackPayload {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CallbackDelivery {
  constructor(private readonly repo: DeliveryRepository) {}

  async deliver(
    callbackUrl: string,
    callbackHeaders: Record<string, string>,
    payload: CallbackPayload,
  ): Promise<void> {
    const retryDelays = [0, 1000, 3000];

    for (let i = 0; i < retryDelays.length; i += 1) {
      if (retryDelays[i] > 0) {
        await sleep(retryDelays[i]);
      }

      try {
        const response = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-scheduler-task-id": payload.task_id,
            "x-scheduler-run-id": payload.run_id,
            ...callbackHeaders,
          },
          body: JSON.stringify(payload),
        });

        const body = await response.text();
        this.repo.logAttempt(payload.run_id, callbackUrl, response.status, body || null);

        if (response.ok) {
          return;
        }
      } catch (error) {
        this.repo.logAttempt(
          payload.run_id,
          callbackUrl,
          599,
          error instanceof Error ? error.message : "Unknown delivery error",
        );
      }
    }
  }
}
