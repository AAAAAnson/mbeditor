import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";

describe("WeChat SVG template gallery bundle", () => {
  it("bundles exactly 5 templates (one per interaction pattern)", () => {
    expect(TEMPLATES).toHaveLength(5);
  });

  it("every template has required metadata + non-empty html", () => {
    TEMPLATES.forEach((tpl) => {
      expect(tpl.id, "id").toMatch(/^[a-z0-9-]+$/);
      expect(tpl.filename, `${tpl.id} filename`).toMatch(/\.html$/);
      expect(tpl.title, `${tpl.id} title`).toBeTruthy();
      expect(tpl.pattern, `${tpl.id} pattern`).toBeTruthy();
      expect(tpl.topic, `${tpl.id} topic`).toBeTruthy();
      expect(tpl.wordCount, `${tpl.id} wordCount`).toBeGreaterThan(0);
      expect(tpl.preview, `${tpl.id} preview`).toBeTruthy();

      // ?raw import should deliver a big blob of HTML; anything less than 1kB
      // means the vendored template was swapped for an empty file or the
      // import path drifted. Catch that early.
      expect(tpl.html.length, `${tpl.id} html length`).toBeGreaterThan(1000);
      expect(tpl.html, `${tpl.id} html shape`).toMatch(/<section|<svg/i);
    });
  });

  it("template ids and filenames are unique", () => {
    const ids = new Set(TEMPLATES.map((tpl) => tpl.id));
    const files = new Set(TEMPLATES.map((tpl) => tpl.filename));
    expect(ids.size).toBe(TEMPLATES.length);
    expect(files.size).toBe(TEMPLATES.length);
  });

  it("every template ships a well-formed thumbnail SVG", () => {
    TEMPLATES.forEach((tpl) => {
      expect(tpl.thumbnailSvg, `${tpl.id} thumbnailSvg`).toBeTruthy();
      const svg = tpl.thumbnailSvg as string;
      expect(svg, `${tpl.id} thumbnail opens <svg`).toMatch(/<svg[\s>]/);
      expect(svg, `${tpl.id} thumbnail closes </svg>`).toContain("</svg>");
      // 必须自带 xmlns，否则 data:image/svg+xml 在 <img> 里渲染不出来。
      expect(svg, `${tpl.id} thumbnail xmlns`).toContain("http://www.w3.org/2000/svg");
    });
  });

  it("every declared colorParam.match actually occurs in the template html", () => {
    // 防呆：如果有人改了模板源里的品牌色，这条会立刻红，提醒同步改 match。
    TEMPLATES.forEach((tpl) => {
      (tpl.colorParams ?? []).forEach((param) => {
        expect(param.match, `${tpl.id}.${param.name} match shape`).toMatch(
          /^#[0-9A-Fa-f]{3,8}$/,
        );
        expect(
          tpl.html.includes(param.match),
          `${tpl.id}.${param.name} match "${param.match}" not found in html`,
        ).toBe(true);
        expect(param.default, `${tpl.id}.${param.name} default shape`).toMatch(
          /^#[0-9A-Fa-f]{3,8}$/,
        );
      });
    });
  });

  it("every declared textParam.match actually occurs in the template html", () => {
    TEMPLATES.forEach((tpl) => {
      (tpl.textParams ?? []).forEach((param) => {
        expect(param.match, `${tpl.id}.${param.name} match`).toBeTruthy();
        expect(
          tpl.html.includes(param.match),
          `${tpl.id}.${param.name} text match "${param.match}" not found in html`,
        ).toBe(true);
        expect(param.maxLength, `${tpl.id}.${param.name} maxLength`).toBeGreaterThan(0);
      });
    });
  });
});
