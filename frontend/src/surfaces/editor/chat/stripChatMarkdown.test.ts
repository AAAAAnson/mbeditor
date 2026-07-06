import { describe, expect, it } from "vitest";

import { stripChatMarkdown } from "./stripChatMarkdown";

describe("stripChatMarkdown", () => {
  it("去掉成对双星号保留粗体文字", () => {
    expect(stripChatMarkdown("这里**很重要**哦")).toBe("这里很重要哦");
  });

  it("去掉成对单星号保留斜体文字", () => {
    expect(stripChatMarkdown("这是*强调*内容")).toBe("这是强调内容");
  });

  it("去掉行首 ATX 标题标记保留标题文字", () => {
    expect(stripChatMarkdown("## 标题")).toBe("标题");
    expect(stripChatMarkdown("###### 六级标题")).toBe("六级标题");
  });

  it("去掉行内反引号保留代码文字", () => {
    expect(stripChatMarkdown("用 `replace_block` 工具")).toBe("用 replace_block 工具");
  });

  it("纯中文口语原样返回", () => {
    const plain = "好的,我把标题改得更抓人一些。";
    expect(stripChatMarkdown(plain)).toBe(plain);
  });

  it("跨行结构保留,逐行剥离记号", () => {
    const input = "## 计划\n先改**标题**\n再调 `正文`";
    expect(stripChatMarkdown(input)).toBe("计划\n先改标题\n再调 正文");
  });

  it("空串原样返回", () => {
    expect(stripChatMarkdown("")).toBe("");
  });

  it("不误伤没有配对的单个星号", () => {
    expect(stripChatMarkdown("3 * 4 = 12")).toBe("3 * 4 = 12");
  });
});
