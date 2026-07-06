import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AskFlow from "./AskFlow";
import type { ComposeAnswers } from "./ComposeSurface";

const ANSWERS: ComposeAnswers = {
  intent: "上周末带娃去海洋馆",
  audience: "",
  tone: "",
  voiceSample: "",
  useBrandVoice: false,
};

describe("AskFlow 文案人话化", () => {
  it("不出现『品牌音色』『STEP 1』黑话", () => {
    render(<AskFlow answers={ANSWERS} onPatch={() => {}} onStart={() => {}} />);
    expect(screen.queryByText("品牌音色")).toBeNull();
    expect(screen.queryByText(/STEP 1/)).toBeNull();
    expect(screen.queryByText("学你的笔法")).toBeNull();
  });

  it("出现人话版的角标与笔法标题", () => {
    render(<AskFlow answers={ANSWERS} onPatch={() => {}} onStart={() => {}} />);
    expect(screen.getByText("快好了 · 还剩 3 个小选择")).toBeInTheDocument();
    expect(screen.getByText("参考我以前的文章")).toBeInTheDocument();
  });

  it("受众/调子/音色都给了人话提示(tooltip)解释黑话", () => {
    render(<AskFlow answers={ANSWERS} onPatch={() => {}} onStart={() => {}} />);

    // 「受众」「语气」「学你的语气」这些短词旁挂 title 提示,鼠标悬停能看懂
    const audienceHint = screen.getByText("受众");
    expect(audienceHint).toHaveAttribute("title");
    expect(audienceHint.getAttribute("title") ?? "").toMatch(/给谁看|读者|对象/);

    const toneHint = screen.getByText("语气");
    expect(toneHint).toHaveAttribute("title");
    expect(toneHint.getAttribute("title") ?? "").toMatch(/口吻|语气|腔调|风格/);

    const voiceHint = screen.getByText("学你的语气");
    expect(voiceHint).toHaveAttribute("title");
    expect((voiceHint.getAttribute("title") ?? "").length).toBeGreaterThan(0);
  });

  it("每道题给一句人话示例,降低小白理解门槛", () => {
    render(<AskFlow answers={ANSWERS} onPatch={() => {}} onStart={() => {}} />);
    // 三道题各有一条以「比如」开头的人话示例说明
    const examples = screen.getAllByText(/^比如/);
    expect(examples.length).toBeGreaterThanOrEqual(3);
  });

  it("recap 使用真实 intentText,改句子回 intent;流程头不再重复『返回起稿台』", () => {
    const onBack = vi.fn();

    render(
      <AskFlow
        answers={ANSWERS}
        intentText="周末带娃去植物园"
        onPatch={() => {}}
        onStart={() => {}}
        onBack={onBack}
      />,
    );

    expect(screen.getByText("周末带娃去植物园")).toBeInTheDocument();

    // 全局面包屑(ComposeSurface)已有一个返回链接,流程头不应再重复一个
    // 返回起稿台的导航行为由 ComposeSurface 测试覆盖。
    expect(screen.queryByRole("button", { name: "返回起稿台" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /改一下/ }));
    expect(onBack).toHaveBeenCalledWith("intent");
  });

  it("开始写必须等受众与调子都选好", () => {
    const onStart = vi.fn();
    render(
      <AskFlow
        answers={ANSWERS}
        intentText="周末带娃去植物园"
        onPatch={() => {}}
        onStart={onStart}
        onBack={() => {}}
      />,
    );

    const start = screen.getByRole("button", { name: "开始写" });
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(onStart).not.toHaveBeenCalled();
  });
});
