import { CronExpressionParser } from "cron-parser";
import { DateTime, Duration } from "luxon";
import type { ScheduleConfig } from "../types";

const intervalPattern = /^P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/;

export function nowIso(): string {
  return new Date().toISOString();
}

export function validateTimezone(timezone: string): void {
  const dt = DateTime.now().setZone(timezone);
  if (!dt.isValid) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

export function validateSchedule(schedule: ScheduleConfig): void {
  validateTimezone(schedule.timezone);

  if (schedule.type === "cron") {
    CronExpressionParser.parse(schedule.expression, { tz: schedule.timezone });
    return;
  }

  if (!intervalPattern.test(schedule.expression)) {
    throw new Error(
      "Invalid interval expression. Use ISO-8601 duration like PT5M/PT1H/PT30S",
    );
  }

  const duration = Duration.fromISO(schedule.expression);
  if (!duration.isValid || duration.as("seconds") <= 0) {
    throw new Error("Interval duration must be greater than zero");
  }
}

export function computeNextRunAt(schedule: ScheduleConfig, fromIso?: string): string {
  const from = DateTime.fromISO(fromIso ?? nowIso(), { zone: schedule.timezone });
  if (!from.isValid) {
    throw new Error(`Invalid fromIso timestamp: ${fromIso ?? ""}`);
  }

  if (schedule.type === "cron") {
    const interval = CronExpressionParser.parse(schedule.expression, {
      currentDate: from.toJSDate(),
      tz: schedule.timezone,
    });
    return interval.next().toDate().toISOString();
  }

  const duration = Duration.fromISO(schedule.expression);
  return from.plus(duration).toUTC().toISO() ?? new Date().toISOString();
}

export function computeRetryAt(
  baseDelayMs: number,
  currentAttempt: number,
  fromIso?: string,
): string {
  const factor = Math.max(0, currentAttempt - 1);
  const delay = baseDelayMs * Math.pow(3, factor);
  const from = DateTime.fromISO(fromIso ?? nowIso(), { zone: "utc" });
  return from.plus({ milliseconds: delay }).toISO() ?? new Date().toISOString();
}
