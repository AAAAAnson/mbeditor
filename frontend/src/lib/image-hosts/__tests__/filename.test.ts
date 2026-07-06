import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildObjectKey } from "../filename";

describe("buildObjectKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("generates YYYY/MM/<uuid>.<ext>", () => {
    const file = new File(["x"], "photo.PNG", { type: "image/png" });
    const key = buildObjectKey(file);
    expect(key).toMatch(/^2026\/04\/[0-9a-f-]{36}\.png$/);
  });

  it("falls back to bin extension when no filename extension is available", () => {
    const file = new File(["x"], "noext", { type: "application/octet-stream" });
    expect(buildObjectKey(file)).toMatch(/\.bin$/);
  });
});
