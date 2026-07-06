import { create } from "zustand";
import api from "@/lib/api";

export type HealthStatus = "ok" | "down" | "unknown";

/** Base polling interval while the backend is healthy. */
export const POLL_INTERVAL_MS = 30_000;
/** Consecutive failures required before reporting the backend as down. */
export const FAILURE_THRESHOLD = 2;
/** Upper bound for exponential backoff after repeated failures. */
export const MAX_BACKOFF_MS = 5 * 60_000;

interface HealthState {
  status: HealthStatus;
  /** Begin polling GET /version. Idempotent — safe to call repeatedly. */
  start: () => void;
  /** Stop polling and clear any pending timer. */
  stop: () => void;
}

// Timer + bookkeeping live outside reactive state so polling never triggers
// re-renders and persistence/devtools never see ephemeral counters.
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let consecutiveFailures = 0;
// Guards against an in-flight poll resolving after stop()/restart.
let pollToken = 0;

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Delay before the next poll given the current consecutive-failure count. */
function nextDelay(): number {
  if (consecutiveFailures <= 0) {
    return POLL_INTERVAL_MS;
  }
  // 1 failure -> 2x base, 2 failures -> 4x base, ... capped at MAX_BACKOFF_MS.
  const backoff = POLL_INTERVAL_MS * 2 ** consecutiveFailures;
  return Math.min(backoff, MAX_BACKOFF_MS);
}

function schedule() {
  clearTimer();
  if (!running) return;
  timer = setTimeout(() => {
    void poll();
  }, nextDelay());
}

async function poll(): Promise<void> {
  const token = pollToken;
  try {
    await api.get("/version");
    if (token !== pollToken || !running) return;
    // Recovery is immediate: any success clears failures and reports ok.
    consecutiveFailures = 0;
    useHealthStore.setState({ status: "ok" });
  } catch {
    if (token !== pollToken || !running) return;
    consecutiveFailures += 1;
    // A single failure must not flip the light — only sustained outage does.
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      useHealthStore.setState({ status: "down" });
    }
  } finally {
    if (token === pollToken && running) {
      schedule();
    }
  }
}

export const useHealthStore = create<HealthState>()(() => ({
  status: "unknown",

  start: () => {
    if (running) return;
    running = true;
    consecutiveFailures = 0;
    pollToken += 1;
    // Poll immediately so the indicator reflects reality without a 30s wait.
    void poll();
  },

  stop: () => {
    running = false;
    pollToken += 1;
    consecutiveFailures = 0;
    clearTimer();
  },
}));
