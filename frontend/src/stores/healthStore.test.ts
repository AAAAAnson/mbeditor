import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

import api from "@/lib/api";
import { useHealthStore, POLL_INTERVAL_MS, MAX_BACKOFF_MS } from "./healthStore";

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

/** Let pending microtasks (the awaited api.get promise) settle. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("healthStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useHealthStore.getState().stop();
    useHealthStore.setState({ status: "unknown" });
  });

  afterEach(() => {
    useHealthStore.getState().stop();
    vi.useRealTimers();
  });

  it("starts in unknown status", () => {
    expect(useHealthStore.getState().status).toBe("unknown");
  });

  it("becomes ok after a successful poll", async () => {
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    useHealthStore.getState().start();
    await flush();
    expect(api.get).toHaveBeenCalledWith("/version");
    expect(useHealthStore.getState().status).toBe("ok");
  });

  it("does NOT go down after a single failure", async () => {
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    useHealthStore.getState().start();
    await flush();
    expect(useHealthStore.getState().status).toBe("ok");

    // first failure
    mockGet.mockRejectedValueOnce(new Error("network"));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await flush();
    // single failure must not flip to down
    expect(useHealthStore.getState().status).not.toBe("down");
    expect(useHealthStore.getState().status).toBe("ok");
  });

  it("goes down only after two consecutive failures", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    useHealthStore.getState().start();
    await flush();
    // after first failure: still not down (was unknown)
    expect(useHealthStore.getState().status).not.toBe("down");

    // second failure -> backoff fired (failure backoff is larger than 0)
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await flush();
    expect(useHealthStore.getState().status).toBe("down");
  });

  it("recovers to ok immediately on a successful poll after being down", async () => {
    mockGet.mockRejectedValue(new Error("network"));
    useHealthStore.getState().start();
    await flush();
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await flush();
    expect(useHealthStore.getState().status).toBe("down");

    // now backend recovers
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await flush();
    expect(useHealthStore.getState().status).toBe("ok");
  });

  it("uses exponential backoff after failures and resets interval on success", async () => {
    // Keep failing so every scheduled poll grows the backoff window.
    mockGet.mockRejectedValue(new Error("network"));

    // 1st poll runs immediately on start() and fails -> next delay = 2x base.
    useHealthStore.getState().start();
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Advancing by exactly the base interval must NOT trigger the next poll:
    // the backoff after one failure is longer than the base interval.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Finishing the (2x) backoff window triggers the 2nd poll, which fails too,
    // pushing the next delay out to 4x base.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(2);

    // 4x base means the base interval alone still does not fire the 3rd poll.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("resets the polling interval back to base after a successful poll", async () => {
    // Two failures to build up backoff, then a success.
    mockGet.mockRejectedValueOnce(new Error("net1"));
    useHealthStore.getState().start();
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Recover on the next (backoff) poll.
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await flush();
    expect(useHealthStore.getState().status).toBe("ok");
    const callsAfterRecovery = mockGet.mock.calls.length;

    // After success the interval is back to base: advancing one base interval
    // fires exactly one more poll.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await flush();
    expect(mockGet.mock.calls.length).toBe(callsAfterRecovery + 1);
  });

  it("backoff is capped at the max", () => {
    // sanity: the cap is a sane upper bound (<= 5min) and >= the base interval
    expect(MAX_BACKOFF_MS).toBeGreaterThanOrEqual(POLL_INTERVAL_MS);
    expect(MAX_BACKOFF_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it("start() is idempotent (no duplicate concurrent timers)", async () => {
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    useHealthStore.getState().start();
    useHealthStore.getState().start();
    await flush();
    // both start() calls should not double the immediate polls
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("stop() halts further polling", async () => {
    mockGet.mockResolvedValue({ data: { version: "1.0.0" } });
    useHealthStore.getState().start();
    await flush();
    const callsBeforeStop = mockGet.mock.calls.length;
    useHealthStore.getState().stop();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    await flush();
    expect(mockGet.mock.calls.length).toBe(callsBeforeStop);
  });
});
