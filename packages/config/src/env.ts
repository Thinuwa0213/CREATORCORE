import type { z } from "zod";
import { ConfigValidationError } from "./errors.js";

/**
 * Parses `source` (defaults to `process.env`) against `schema`, failing fast
 * with a `ConfigValidationError` that never echoes the offending raw value —
 * only the field name and zod's own issue message. Call sites must not catch
 * this and continue; missing/malformed required configuration is a startup
 * failure, not a degraded-mode condition.
 */
export function loadConfig<Schema extends z.ZodType>(
  scope: string,
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(scope, result.error);
  }
  return result.data;
}
