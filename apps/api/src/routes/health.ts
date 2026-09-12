import { Hono } from "hono";

/**
 * Liveness: "is this process alive?" Never checks MySQL — a slow/unavailable
 * database must not make the process look dead to a process supervisor.
 */
export function createHealthRoute(): Hono {
  const route = new Hono();
  route.get("/", (c) => c.json({ status: "ok" }));
  return route;
}
