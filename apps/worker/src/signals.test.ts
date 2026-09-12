import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@creatorcore/logger";
import { WorkerLifecycle } from "./lifecycle.js";
import { registerShutdownHandlers } from "./signals.js";

function silentLogger() {
  return createLogger({ service: "worker-test", write: () => undefined });
}

afterEach(() => {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
});

describe("registerShutdownHandlers", () => {
  it("transitions running -> stopping -> stopped and runs cleanup on SIGTERM", async () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    const onShutdown = vi.fn();
    const exit = vi.fn();

    registerShutdownHandlers(lifecycle, silentLogger(), { onShutdown, exit });
    process.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onShutdown).toHaveBeenCalledOnce();
    expect(lifecycle.state).toBe("stopped");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("runs shutdown exactly once even if SIGTERM and SIGINT both arrive", async () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    const onShutdown = vi.fn();
    const exit = vi.fn();

    registerShutdownHandlers(lifecycle, silentLogger(), { onShutdown, exit });
    process.emit("SIGTERM");
    process.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onShutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("still reaches stopped and exits safely when cleanup throws", async () => {
    const lifecycle = new WorkerLifecycle(silentLogger());
    lifecycle.transition("running");
    const exit = vi.fn();

    registerShutdownHandlers(lifecycle, silentLogger(), {
      onShutdown: () => {
        throw new Error("cleanup failed");
      },
      exit,
    });
    process.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lifecycle.state).toBe("stopped");
    expect(exit).toHaveBeenCalledWith(0);
  });
});
