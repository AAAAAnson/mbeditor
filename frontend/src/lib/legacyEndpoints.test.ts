import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("no references to removed endpoints", () => {
  // Plain-substring forbidden needles. NOTE: ``/publish/process`` is NOT
  // listed here because the live endpoint ``/publish/process-for-copy`` shares
  // that prefix — a bare ``toContain("/publish/process")`` false-positives on
  // the valid endpoint (and its doc comments). The removed bare endpoint is
  // matched precisely via ``forbiddenPatterns`` below instead.
  // NOTE: ``/articles`` / ``/api/v1/articles`` 曾是被移除的旧端点,但 P1 批1
  // (2026-07-05)把 ``/api/v1/articles`` 作为文章主存储端点正式复活(C1 内容
  // 安全:localStorage 迁后端),前端 lib/articlesApi.ts 合法调用 —— 已从禁用
  // 清单摘除。
  const forbidden = [
    "/api/v1/mbdoc",
    "/api/v1/images",
    "/api/v1/config",
    "/publish/html",
    "/publish/draft",
    "\"/mbdoc\"",
    "\"/images\"",
    "\"/config\"",
  ];

  // Regex needles for removed endpoints whose path is a prefix of a still-live
  // endpoint. ``/publish/process`` was removed; ``/publish/process-for-copy``
  // is current. Match the removed one only when NOT immediately followed by
  // ``-for-copy`` (i.e. a terminating quote, whitespace, or end-of-string).
  const forbiddenPatterns: { label: string; re: RegExp }[] = [
    { label: "/publish/process (bare, removed)", re: /\/publish\/process(?!-for-copy)/ },
  ];

  for (const file of walk("src")) {
    it(`${file} has no forbidden endpoint strings`, () => {
      const text = readFileSync(file, "utf-8");
      for (const needle of forbidden) {
        expect(text, `${file} contains ${needle}`).not.toContain(needle);
      }
      for (const { label, re } of forbiddenPatterns) {
        expect(re.test(text), `${file} contains ${label}`).toBe(false);
      }
    });
  }
});
