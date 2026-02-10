type LogLevel = "debug" | "info" | "warn" | "error";

const rank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.SCHEDULER_LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
const minLevel = rank[configuredLevel] ?? rank.info;

function shouldLog(level: LogLevel): boolean {
  return rank[level] >= minLevel;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? { ctx: context } : {}),
  };
  console.error(JSON.stringify(payload));
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    emit("error", message, context),
};

