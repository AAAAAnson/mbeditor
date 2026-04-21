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
  const forbidden = [
    "/api/v1/articles",
    "/api/v1/mbdoc",
    "/api/v1/images",
    "/api/v1/config",
    "/publish/html",
    "/publish/process",
    "/publish/draft",
    "\"/articles\"",
    "\"/mbdoc\"",
    "\"/images\"",
    "\"/config\"",
  ];

  for (const file of walk("src")) {
    it(`${file} has no forbidden endpoint strings`, () => {
      const text = readFileSync(file, "utf-8");
      for (const needle of forbidden) {
        expect(text, `${file} contains ${needle}`).not.toContain(needle);
      }
    });
  }
});
