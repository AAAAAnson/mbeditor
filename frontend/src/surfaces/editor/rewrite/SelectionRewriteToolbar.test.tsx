import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SelectionRewriteToolbar from "./SelectionRewriteToolbar";

function makeContainer(html = "<p>第一段文字</p><section>图<svg></svg></section>") {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const ref = createRef<HTMLDivElement>();
  // @ts-expect-error 写只读 ref.current(测试注入)
  ref.current = container;
  return { container, ref };
}

/** 伪造 document.getSelection 锚点并派发 selectionchange。 */
function selectNode(node: Node | null) {
  vi.spyOn(document, "getSelection").mockReturnValue({
    anchorNode: node,
  } as unknown as Selection);
  fireEvent(document, new Event("selectionchange"));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("SelectionRewriteToolbar — idle 选中出条", () => {
  it("选中段落文本节点后浮出工具条(3 预设 + 自由输入)", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={vi.fn()} />);

    selectNode(container.querySelector("p")!.firstChild);
    expect(screen.getByTestId("rewrite-toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "润色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "缩短" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "换个说法" })).toBeInTheDocument();
    expect(screen.getByLabelText("自由改写指令")).toBeInTheDocument();
  });

  it("enabled=false 不出条", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled={false} onInstruct={vi.fn()} />);
    selectNode(container.querySelector("p")!.firstChild);
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
  });

  it("含 svg 的块不出条", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={vi.fn()} />);
    selectNode(container.querySelector("svg")!);
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
  });

  it("选区移出容器后条消失", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={vi.fn()} />);
    selectNode(container.querySelector("p")!.firstChild);
    expect(screen.getByTestId("rewrite-toolbar")).toBeInTheDocument();
    selectNode(document.body);
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
  });
});

describe("SelectionRewriteToolbar — 收编 chat:预设/自由指令注入", () => {
  it("点预设 → onInstruct 带「把这一段{预设}:{段落文本}」,条收起", () => {
    const { container, ref } = makeContainer();
    const onInstruct = vi.fn();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={onInstruct} />);
    selectNode(container.querySelector("p")!.firstChild);

    fireEvent.click(screen.getByRole("button", { name: "润色" }));
    expect(onInstruct).toHaveBeenCalledTimes(1);
    const instruction = onInstruct.mock.calls[0][0] as string;
    expect(instruction).toContain("把这一段润色");
    expect(instruction).toContain("第一段文字");
    expect(screen.queryByTestId("rewrite-toolbar")).toBeNull();
  });

  it("自由输入 Enter → onInstruct 带自定义指令 + 段落文本;空输入发送禁用", () => {
    const { container, ref } = makeContainer();
    const onInstruct = vi.fn();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={onInstruct} />);
    selectNode(container.querySelector("p")!.firstChild);

    expect(screen.getByRole("button", { name: "发送改写指令" })).toBeDisabled();
    const input = screen.getByLabelText("自由改写指令");
    fireEvent.change(input, { target: { value: "更有画面感" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onInstruct).toHaveBeenCalledTimes(1);
    const instruction = onInstruct.mock.calls[0][0] as string;
    expect(instruction).toContain("更有画面感");
    expect(instruction).toContain("针对这段");
    expect(instruction).toContain("第一段文字");
  });

  it("退化后无 rewriting/reviewing 态:传 status 也不出进度/采用条(组件不再读 api)", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled onInstruct={vi.fn()} />);
    selectNode(container.querySelector("p")!.firstChild);
    // 只有 idle 工具条,绝无老状态机的两条
    expect(screen.queryByTestId("rewrite-progress")).toBeNull();
    expect(screen.queryByTestId("rewrite-review-bar")).toBeNull();
  });
});

describe("SelectionRewriteToolbar — 移动 390", () => {
  it("isMobile 时工具条为底部通栏且按钮触控 ≥44", () => {
    const { container, ref } = makeContainer();
    render(<SelectionRewriteToolbar containerRef={ref} enabled isMobile onInstruct={vi.fn()} />);
    selectNode(container.querySelector("p")!.firstChild);

    const bar = screen.getByTestId("rewrite-toolbar");
    expect(bar.style.position).toBe("fixed");
    expect(bar.style.bottom).toBe("0px");
    const btn = screen.getByRole("button", { name: "润色" });
    expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });
});
