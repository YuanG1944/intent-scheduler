import { db } from "../client";
import { newId } from "../../utils/id";
import { nowIso } from "../../utils/time";

export class DeliveryRepository {
  logAttempt(runId: string, callbackUrl: string, statusCode: number, responseBody: string | null): void {
    db.query(
      `INSERT INTO delivery_logs (id, run_id, callback_url, status_code, response_body, delivered_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newId("delivery"), runId, callbackUrl, statusCode, responseBody, nowIso());
  }
}
