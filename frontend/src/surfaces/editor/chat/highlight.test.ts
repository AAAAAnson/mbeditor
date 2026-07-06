// 预览改动块高亮定位纯函数:块序号 → 预览(可能被单根 section 信封层层包裹)
// 里第 N 个子元素。定位不到静默返回空 —— 绝不往 draft.html 注任何标记。
import { describe, expect, it } from "vitest";

import { locateBlockElements } from "./highlight";

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("locateBlockElements", () => {
  it("剥单根 section 信封链(wechat-root + 文章壳)后按序号取子元素", () => {
    const root = el(
      '<section class="wechat-root"><section><h2>标题</h2><p>一</p><p>二</p></section></section>',
    );
    const hits = locateBlockElements(root, [0, 2], 3);
    expect(hits.map((h) => h.tagName)).toEqual(["H2", "P"]);
    expect(hits[1].textContent).toBe("二");
  });

  it("无信封时直接按 root 子元素取", () => {
    const root = el("<h2>标题</h2><p>一</p>");
    const hits = locateBlockElements(root, [1], 2);
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toBe("一");
  });

  it("子元素数已等于块数时停止下钻(首块恰是 section 不误剥)", () => {
    const root = el("<section><section><p>块一内层</p></section><p>块二</p></section>");
    const hits = locateBlockElements(root, [0], 2);
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toBe("块一内层");
  });

  it("序号越界 / 负数(块已不在 order)静默跳过", () => {
    const root = el("<p>一</p><p>二</p>");
    expect(locateBlockElements(root, [5, -1], 2)).toHaveLength(0);
  });
});
