import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditorToolbar from "./EditorToolbar";

describe("EditorToolbar 顶部常驻格式工具条", () => {
  it("加粗/标题/颜色/图片 按钮/控件可见", () => {
    const ref = createRef<HTMLElement>();
    render(<EditorToolbar targetRef={ref} />);
    ["加粗", "标题", "图片"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
    // 颜色 is a combobox, not a button
    expect(screen.getByRole("combobox", { name: "颜色" })).toBeInTheDocument();
  });

  describe("execCommand 接线", () => {
    beforeEach(() => {
      // jsdom 没有 execCommand,打桩以断言被调用
      (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(true);
    });

    it("加粗 调 execCommand('bold') 并触发 onCommit", () => {
      const ref = createRef<HTMLElement>();
      const onCommit = vi.fn();
      const { container } = render(
        <div>
          <EditorToolbar targetRef={ref} onCommit={onCommit} />
          <div contentEditable ref={ref as never} />
        </div>,
      );
      // wire the ref to the real editable node
      const editable = container.querySelector("[contenteditable]") as HTMLElement;
      (ref as { current: HTMLElement | null }).current = editable;

      fireEvent.click(screen.getByRole("button", { name: "加粗" }));
      expect(document.execCommand).toHaveBeenCalledWith("bold", false, undefined);
      expect(onCommit).toHaveBeenCalled();
    });

    it("标题 调 formatBlock h2", () => {
      const ref = createRef<HTMLElement>();
      const { container } = render(
        <div>
          <EditorToolbar targetRef={ref} />
          <div contentEditable ref={ref as never} />
        </div>,
      );
      (ref as { current: HTMLElement | null }).current = container.querySelector(
        "[contenteditable]",
      ) as HTMLElement;

      fireEvent.click(screen.getByRole("button", { name: "标题" }));
      expect(document.execCommand).toHaveBeenCalledWith("formatBlock", false, "<h2>");
    });

    it("图片 调 onPickImage(由 host 负责上传)", () => {
      const ref = createRef<HTMLElement>();
      const onPickImage = vi.fn();
      render(<EditorToolbar targetRef={ref} onPickImage={onPickImage} />);
      fireEvent.click(screen.getByRole("button", { name: "图片" }));
      expect(onPickImage).toHaveBeenCalled();
    });

    it("改颜色作用在选中文字上:换色前先复原编辑区选区", () => {
      const ref = createRef<HTMLElement>();
      const { container } = render(
        <div>
          <EditorToolbar targetRef={ref} />
          <div contentEditable ref={ref as never}>hello world</div>
        </div>,
      );
      const editable = container.querySelector("[contenteditable]") as HTMLElement;
      (ref as { current: HTMLElement | null }).current = editable;

      // 用户选中正文
      const range = document.createRange();
      range.selectNodeContents(editable);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const select = screen.getByRole("combobox", { name: "颜色" });
      // 点开下拉:工具条须在此刻存下选区(随后原生焦点切换会塌缩选区)
      fireEvent.mouseDown(select);
      sel.removeAllRanges(); // 模拟 <select> 取得焦点导致编辑区选区丢失
      fireEvent.change(select, { target: { value: "#C14A3A" } });

      expect(document.execCommand).toHaveBeenCalledWith("foreColor", false, "#C14A3A");
      // 关键:染色发生在原选中文字上,而非塌缩的空光标
      const restored = window.getSelection()!;
      expect(restored.rangeCount).toBe(1);
      expect(restored.toString()).toBe("hello world");
    });

    it("disabled 时按钮不触发 execCommand", () => {
      const ref = createRef<HTMLElement>();
      render(<EditorToolbar targetRef={ref} disabled />);
      fireEvent.click(screen.getByRole("button", { name: "加粗" }));
      expect(document.execCommand).not.toHaveBeenCalled();
    });
  });
});
