import { describe, expect, it } from "vitest";
import { createLogger } from "@creatorcore/logger";
import { WorkerLifecycle } from "./lifecycle.js";

function silentLogger() {
  return createLogger({ service: "worker-test", write: () => undefined });
}

describe("WorkerLifecycle", () => {
  it("starts in the starting state", () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    expect(lifecycle.state).toBe("starting");
    expect(lifecycle.isReady()).toBe(false);
  });

  it("allows the documented startup transition", () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    expect(lifecycle.state).toBe("running");
    expect(lifecycle.isReady()).toBe(true);
  });

  it("allows the documented shutdown transition", () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    lifecycle.transition("stopping");
    lifecycle.transition("stopped");
    expect(lifecycle.state).toBe("stopped");
    expect(lifecycle.isReady()).toBe(false);
  });

  it("rejects an invalid transition rather than silently allowing it", () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    expect(() => lifecycle.transition("stopped")).toThrow(/invalid worker lifecycle transition/);
  });

  it("rejects transitioning out of a terminal state", () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    lifecycle.transition("stopping");
    lifecycle.transition("stopped");
    expect(() => lifecycle.transition("running")).toThrow();
  });
});
