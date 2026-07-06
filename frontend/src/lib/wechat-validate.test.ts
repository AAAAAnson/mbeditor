import { afterEach, describe, expect, it, vi } from "vitest";

import api from "@/lib/api";
import {
  reportIsBlocking,
  reportIsEmpty,
  validateWechatHtml,
  hasSmilAnimation,
  detectSmilAnimations,
  buildSmilWarning,
  findBlobImages,
} from "@/lib/wechat-validate";

describe("findBlobImages(发布/复制前 blob: 硬闸)", () => {
  it("命中 blob: 开头的 img src", () => {
    expect(findBlobImages('<p>x</p><img src="blob:http://localhost/abc-123">')).toEqual([
      "blob:http://localhost/abc-123",
    ]);
  });

  it("data: 图片不命中(后端本就能上传)", () => {
    expect(findBlobImages('<img src="data:image/png;base64,AAAA">')).toEqual([]);
  });

  it("http/https 图片不命中", () => {
    expect(findBlobImages('<img src="https://cdn.example.com/a.png"><img src="http://x/b.jpg">')).toEqual([]);
  });

  it("多张 blob 图全部返回", () => {
    const html =
      '<img src="blob:http://a/1"><img src="https://ok/x.png"><img src="blob:http://a/2">';
    expect(findBlobImages(html)).toEqual(["blob:http://a/1", "blob:http://a/2"]);
  });

  it("单引号/无引号属性也命中,正文里的 blob: 文字不误报", () => {
    expect(findBlobImages("<img src='blob:http://a/sq'>")).toEqual(["blob:http://a/sq"]);
    expect(findBlobImages("<img src=blob:http://a/nq>")).toEqual(["blob:http://a/nq"]);
    expect(findBlobImages("<p>文中提到 blob: 协议</p>")).toEqual([]);
  });

  it("空/无图 html 返回空数组", () => {
    expect(findBlobImages("")).toEqual([]);
    expect(findBlobImages("<p>纯文本</p>")).toEqual([]);
  });
});

describe("SMIL 检测(发布前预警)", () => {
  it("命中 <animate>/<animateTransform>/<animateMotion>/<set>", () => {
    expect(hasSmilAnimation('<svg><animate attributeName="opacity"/></svg>')).toBe(true);
    expect(hasSmilAnimation('<svg><animateTransform type="rotate"/></svg>')).toBe(true);
    expect(hasSmilAnimation("<svg><animateMotion/></svg>")).toBe(true);
    expect(hasSmilAnimation('<svg><set attributeName="visibility"/></svg>')).toBe(true);
  });

  it("纯静态 / 普通 html 不命中,自定义元素不误报", () => {
    expect(hasSmilAnimation("<svg><rect/></svg>")).toBe(false);
    expect(hasSmilAnimation("<p>text</p>")).toBe(false);
    expect(hasSmilAnimation("<animatething/>")).toBe(false);
    expect(hasSmilAnimation("<settings/>")).toBe(false);
  });

  it("detectSmilAnimations 累加计数", () => {
    const d = detectSmilAnimations("<animate/><animate/><animateTransform/>");
    expect(d.animate).toBe(2);
    expect(d.animateTransform).toBe(1);
    expect(d.total).toBe(3);
  });

  it("buildSmilWarning 产出 rule/message/suggestion", () => {
    const w = buildSmilWarning(detectSmilAnimations("<animate/><set/>"));
    expect(w.rule).toBe("smil-static-on-publish");
    expect(w.message).toMatch(/2/);
    expect(w.suggestion).toBeTruthy();
  });
});

describe("validateWechatHtml", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a well-formed response into a typed report", async () => {
    const mockReport = {
      issues: [{ line: 3, rule: "forbidden-tag", message: "m", suggestion: "s" }],
      warnings: [{ line: 1, rule: "svg-xmlns", message: "w", suggestion: "x" }],
      stats: {
        svg_count: 1,
        animate_count: 0,
        animate_transform_count: 0,
        set_count: 0,
        anchor_count: 0,
      },
    };
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: { code: 0, data: mockReport, message: "" } });

    const result = await validateWechatHtml("<svg></svg>");
    expect(postSpy).toHaveBeenCalledWith(
      "/wechat/validate",
      { html: "<svg></svg>" },
      expect.any(Object),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.issues).toHaveLength(1);
      expect(result.report.issues[0].rule).toBe("forbidden-tag");
      expect(result.report.warnings[0].rule).toBe("svg-xmlns");
      expect(result.report.stats.svg_count).toBe(1);
    }
  });

  it("fails open on network error", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await validateWechatHtml("<svg></svg>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ECONNREFUSED");
  });

  it("fails open on non-zero response code", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { code: 1, data: null, message: "boom" },
    });
    const result = await validateWechatHtml("x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("boom");
  });

  it("fails open on malformed payload", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { code: 0, data: { issues: "nope" }, message: "" },
    });
    const result = await validateWechatHtml("x");
    expect(result.ok).toBe(false);
  });

  it("reportIsBlocking / reportIsEmpty helpers agree with finding counts", () => {
    const blocking = {
      issues: [{ line: 0, rule: "r", message: "m", suggestion: "s" }],
      warnings: [],
      stats: {
        svg_count: 0,
        animate_count: 0,
        animate_transform_count: 0,
        set_count: 0,
        anchor_count: 0,
      },
    };
    expect(reportIsBlocking(blocking)).toBe(true);
    expect(reportIsEmpty(blocking)).toBe(false);

    const empty = { issues: [], warnings: [], stats: blocking.stats };
    expect(reportIsBlocking(empty)).toBe(false);
    expect(reportIsEmpty(empty)).toBe(true);
  });
});
