import type { z } from "zod";

/**
 * Thrown when environment configuration fails validation. The message
 * intentionally includes only field *names* and zod's own issue messages —
 * not the raw value — so a misconfigured secret can never leak through a
 * thrown error, a test failure, or a startup log line.
 *
 * This holds for every schema in this package today because no secret-
 * bearing field uses `z.enum`/`z.literal` (whose issue messages can echo the
 * received value) — only `z.string()`/`z.coerce.number()`, whose messages
 * don't. If a future schema adds an enum/literal validator to a secret-
 * adjacent field, re-verify this guarantee against that specific case rather
 * than assuming it still holds — it is a property of the schemas in use,
 * not an unconditional guarantee of zod itself.
 */
export class ConfigValidationError extends Error {
  readonly issues: readonly { path: string; message: string }[];

  constructor(scope: string, error: z.ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    super(`Invalid ${scope} configuration — ${summary}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}
