import { describe, it, expect } from "vitest";
import { getEngine, listEngines } from "../registry";

describe("image-host registry", () => {
  it("lists all 5 engines with stable order", () => {
    const ids = listEngines().map((e) => e.id);
    expect(ids).toEqual(["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"]);
  });

  it("resolves engine by id", () => {
    const eng = getEngine("github");
    expect(eng.label).toBe("GitHub");
  });

  it("throws for unknown id", () => {
    // @ts-expect-error testing runtime guard
    expect(() => getEngine("bogus")).toThrow(/unknown image host/i);
  });
});
