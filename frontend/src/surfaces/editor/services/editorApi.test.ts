import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationReport } from "@/components/validation/types";
import api from "@/lib/api";
import { processForCopy } from "./editorApi";

// Spy on the real axios singleton's ``post`` rather than ``vi.mock``-ing the
// whole ``@/lib/api`` module. Under the project's ``vmThreads`` pool a module
// mock registered here can be shadowed by another suite that imported the real
// client into the shared VM first; mutating the singleton's method is immune to
// that load-order race and never hits the network.
const postSpy = vi.spyOn(api, "post");

const REPORT: ValidationReport = {
  issues: [
    { line: 3, rule: "svg-animate", message: "不支持的动画属性", suggestion: "改用 transform" },
  ],
  warnings: [
    { line: 5, rule: "css-var", message: "CSS 变量可能被剥离", suggestion: "改用字面量" },
  ],
  stats: {
    svg_count: 1,
    animate_count: 1,
    animate_transform_count: 0,
    set_count: 0,
    anchor_count: 0,
  },
};

function ok<T>(data: T) {
  return { data: { code: 0, message: "ok", data } } as never;
}

beforeEach(() => {
  postSpy.mockReset();
});

afterEach(() => {
  postSpy.mockReset();
});

describe("processForCopy", () => {
  it("returns both html and the validation report from the copy pipeline", async () => {
    postSpy.mockResolvedValue(ok({ html: "<section>x</section>", report: REPORT }));

    const result = await processForCopy("<p>x</p>", "");

    expect(result.html).toBe("<section>x</section>");
    expect(result.report).not.toBeUndefined();
    expect(result.report).not.toBeNull();
    expect(result.report).toEqual(REPORT);
  });

  it("posts to the copy endpoint with credentials and html/css", async () => {
    postSpy.mockResolvedValue(ok({ html: "<section>x</section>", report: REPORT }));

    await processForCopy("<p>body</p>", "p{color:red}", "wxA", "secretA");

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload] = postSpy.mock.calls[0];
    expect(url).toContain("process-for-copy");
    expect(payload).toMatchObject({
      html: "<p>body</p>",
      css: "p{color:red}",
      appid: "wxA",
      appsecret: "secretA",
    });
  });

  it("normalizes a missing report to null so callers can fail open explicitly", async () => {
    postSpy.mockResolvedValue(ok({ html: "<section>x</section>" }));

    const result = await processForCopy("<p>x</p>", "");

    expect(result.html).toBe("<section>x</section>");
    expect(result.report).toBeNull();
  });

  it("throws when the backend returns a non-zero code", async () => {
    postSpy.mockResolvedValue({ data: { code: 1, message: "boom", data: null } } as never);

    await expect(processForCopy("<p>x</p>", "")).rejects.toThrow("boom");
  });
});
