function hasDuplicateKeyCode(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

/**
 * Drizzle wraps every driver-level error in its own `DrizzleQueryError`,
 * with the real mysql2 error (carrying `.code`) on `.cause` — checking only
 * the outer error's `.code` never matches, since mysql2's `code` field
 * isn't itself present on Drizzle's wrapper. Checked at both levels so this
 * keeps working if a future Drizzle version stops wrapping.
 *
 * Shared by every repository that relies on a primary-key/unique-constraint
 * collision to detect a concurrent winner (insert-first, catch-duplicate —
 * `worker-assignments.ts`'s `claimAssignment`, `guild-connections.ts`'s
 * `connectGuildForUser`) rather than reimplementing this unwrapping twice.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (hasDuplicateKeyCode(error)) {
    return true;
  }
  if (error instanceof Error && error.cause) {
    return hasDuplicateKeyCode(error.cause);
  }
  return false;
}
