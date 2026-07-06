import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "@/lib/api";
import { useWechatLint } from "./useWechatLint";

const EMPTY_STATS = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

function successResponse(issues: unknown[] = [], warnings: unknown[] = []) {
  return {
    data: {
      code: 0,
      message: "",
      data: { issues, warnings, stats: EMPTY_STATS },
    },
  };
}

describe("useWechatLint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("debounces validator calls to ~500ms of idle time", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue(successResponse([{ line: 1, rule: "r", message: "m", suggestion: "s" }]));

    const { rerender } = renderHook(({ html }) => useWechatLint(html), {
      initialProps: { html: "<svg>a</svg>" },
    });

    // Tick 250ms → still debouncing, nothing fired yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(postSpy).not.toHaveBeenCalled();

    // Keystroke resets the timer.
    rerender({ html: "<svg>ab</svg>" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(postSpy).not.toHaveBeenCalled();

    // After another 500ms the debounced fetch fires exactly once.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight request on unmount", async () => {
    const abortSpies: Array<ReturnType<typeof vi.fn>> = [];
    vi.spyOn(api, "post").mockImplementation((..._args: unknown[]) => {
      // Record the signal from the axios config so we can assert abort.
      const config = _args[2] as { signal?: AbortSignal } | undefined;
      if (config?.signal) {
        const spy = vi.fn();
        config.signal.addEventListener("abort", spy);
        abortSpies.push(spy);
      }
      // Never resolve — the hook should bail via abort.
      return new Promise(() => undefined) as unknown as Promise<unknown>;
    });

    const { unmount } = renderHook(() => useWechatLint("<svg>z</svg>"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });

    unmount();
    // At least one AbortController fired on unmount cleanup.
    expect(abortSpies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
  });

  it("returns an empty report without hitting the network for blank html", async () => {
    const postSpy = vi.spyOn(api, "post");
    const { result } = renderHook(({ html }) => useWechatLint(html), {
      initialProps: { html: "   " },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(postSpy).not.toHaveBeenCalled();
    expect(result.current.issues).toEqual([]);
    expect(result.current.warnings).toEqual([]);
    expect(result.current.running).toBe(false);
  });
});
