import { redact } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Fields every log line may carry, per docs/adr/0010-observability-audit.md:
 * correlation/request ID, worker ID where applicable, tenant/guild ID where
 * safe. None of these are required yet — nothing in Phase 2 has a real
 * request/worker/tenant context — but the shape exists now so call sites
 * don't invent their own field names later.
 */
export interface LogContext {
  correlationId?: string;
  workerId?: string;
  tenantId?: string;
  guildId?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  /** Logical component/service name, e.g. "apps/api", "apps/worker". */
  service: string;
  /** Minimum level that is actually emitted. Defaults to "info". */
  level?: LogLevel;
  /** Override the sink for testing; defaults to console. */
  write?: (line: string) => void;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function emit(
  options: Required<Pick<LoggerOptions, "service" | "level" | "write">>,
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[options.level]) return;

  const line = {
    timestamp: new Date().toISOString(),
    level,
    service: options.service,
    message,
    ...(context ? (redact(context) as LogContext) : {}),
  };

  options.write(JSON.stringify(line));
}

/**
 * Creates a structured JSON logger. Every field passed as `context` is
 * deep-redacted before it is ever stringified — there is no call-site way to
 * bypass redaction short of putting a secret inside `message` itself, which
 * is a misuse this function cannot see into (message is a caller-written
 * string, not structured data).
 */
export function createLogger(options: LoggerOptions): Logger {
  const resolved = {
    service: options.service,
    level: options.level ?? "info",
    write: options.write ?? ((line: string) => console.log(line)),
  };

  return {
    debug: (message, context) => emit(resolved, "debug", message, context),
    info: (message, context) => emit(resolved, "info", message, context),
    warn: (message, context) => emit(resolved, "warn", message, context),
    error: (message, context) => emit(resolved, "error", message, context),
  };
}
