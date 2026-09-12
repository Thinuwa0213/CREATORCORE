import { Hono } from "hono";

export interface ReadyRouteDeps {
  /** Returns whether the database dependency is reachable. Never throws. */
  checkDatabaseReady: () => Promise<boolean>;
}

/**
 * Readiness: "can this process safely serve its responsibility?" Checks
 * real dependency connectivity (here: MySQL) but never leaks DB host,
 * username, connection string, or a stack trace — only a safe boolean
 * status, per the Phase 2 brief's explicit non-leakage requirement.
 */
export function createReadyRoute(deps: ReadyRouteDeps): Hono {
  const route = new Hono();
  route.get("/", async (c) => {
    const databaseReady = await deps.checkDatabaseReady();
    const status = databaseReady ? 200 : 503;
    return c.json(
      { status: databaseReady ? "ready" : "not_ready", database: databaseReady },
      status,
    );
  });
  return route;
}
