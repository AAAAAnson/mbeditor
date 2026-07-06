import { describe, it, expect } from "vitest";
import { githubEngine } from "../github";

describe("githubEngine.isConfigured", () => {
  it("false when token missing", () => {
    expect(githubEngine.isConfigured({ repo: "r", branch: "main", accessToken: "", useCDN: false })).toBe(false);
  });
  it("false when repo missing", () => {
    expect(githubEngine.isConfigured({ repo: "", branch: "main", accessToken: "t", useCDN: false })).toBe(false);
  });
  it("true when all required present", () => {
    expect(githubEngine.isConfigured({ repo: "me/img", branch: "main", accessToken: "t", useCDN: false })).toBe(true);
  });
});

import { vi, beforeEach, afterEach } from "vitest";

describe("githubEngine.upload", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("PUTs to contents API with base64 body and Bearer token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: { download_url: "https://raw.githubusercontent.com/me/img/main/2026/04/x.png", path: "2026/04/x.png" },
      }),
    });
    const file = new File(["abc"], "x.png", { type: "image/png" });
    const res = await githubEngine.upload(file, {
      repo: "me/img", branch: "main", accessToken: "test-token", useCDN: false,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.github\.com\/repos\/me\/img\/contents\/2026\/04\/[0-9a-f-]+\.png$/);
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers.Accept).toBe("application/vnd.github+json");
    const body = JSON.parse(init.body);
    expect(body.branch).toBe("main");
    expect(body.message).toMatch(/upload/i);
    expect(body.content).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(res.url).toBe("https://raw.githubusercontent.com/me/img/main/2026/04/x.png");
  });

  it("rewrites to jsDelivr CDN when useCDN=true", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: { download_url: "https://raw.githubusercontent.com/me/img/main/2026/04/x.png", path: "2026/04/x.png" } }),
    });
    const file = new File(["abc"], "x.png", { type: "image/png" });
    const res = await githubEngine.upload(file, {
      repo: "me/img", branch: "main", accessToken: "t", useCDN: true,
    });
    expect(res.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/me\/img@main\/2026\/04\/[0-9a-f-]+\.png$/);
  });

  it("throws with GitHub error message on non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Bad credentials" }) });
    const file = new File(["abc"], "x.png", { type: "image/png" });
    await expect(
      githubEngine.upload(file, { repo: "me/img", branch: "main", accessToken: "t", useCDN: false })
    ).rejects.toThrow(/Bad credentials/);
  });
});
