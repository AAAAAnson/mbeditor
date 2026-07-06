// EditorSurface × ChatPanel 接线的纯函数层:网格模板(桌面开聊天左栏 336px,
// 移动不占列 —— ChatPanel 自己转 fixed 底抽屉)。
import { describe, expect, it } from "vitest";

import { editorGridTemplate } from "./EditorSurface";

describe("editorGridTemplate", () => {
  it("桌面 + chat 关:维持既有两列/三列", () => {
    expect(editorGridTemplate({ isMobile: false, showStructurePanel: false, chatOpen: false })).toBe("1fr auto");
    expect(editorGridTemplate({ isMobile: false, showStructurePanel: true, chatOpen: false })).toBe(
      "280px 1fr auto",
    );
  });

  it("桌面 + chat 开:左侧加 336px 竖栏", () => {
    expect(editorGridTemplate({ isMobile: false, showStructurePanel: false, chatOpen: true })).toBe(
      "336px 1fr auto",
    );
    expect(editorGridTemplate({ isMobile: false, showStructurePanel: true, chatOpen: true })).toBe(
      "336px 280px 1fr auto",
    );
  });

  it("移动:恒单列(chat 开也不占列,底抽屉是 fixed)", () => {
    expect(editorGridTemplate({ isMobile: true, showStructurePanel: false, chatOpen: false })).toBe("1fr");
    expect(editorGridTemplate({ isMobile: true, showStructurePanel: true, chatOpen: true })).toBe("1fr");
  });
});
