import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("./effectApi", () => ({
  fetchEffects: vi.fn(),
  renderEffect: vi.fn(),
}));

import { EffectGallery } from "./EffectGallery";
import * as effectApi from "./effectApi";

const SAMPLE_EFFECT = {
  id: "mask-reveal",
  category: "quiz" as const,
  title: "遮罩揭答",
  description: "点击淡出遮罩揭晓答案",
  textSlots: [{ name: "SLOT_ANSWER_MAIN", label: "答案", default: "42", maxLength: 40 }],
  imageSlots: [],
  colorSlots: [{ name: "SLOT_MASK_COLOR", label: "遮罩底色", default: "#1B2235" }],
  timingParams: [
    { name: "dur", label: "时长", unit: "s", default: 0.5, min: 0.2, max: 1, step: 0.05 },
  ],
};

beforeEach(() => {
  vi.mocked(effectApi.fetchEffects).mockResolvedValue([SAMPLE_EFFECT]);
  vi.mocked(effectApi.renderEffect).mockResolvedValue({
    status: "ok",
    html: "<svg>OK</svg>",
    warnings: [],
    report: { issues: [] },
  });
});

describe("EffectGallery", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <EffectGallery open={false} onClose={() => {}} onInsert={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(effectApi.fetchEffects).not.toHaveBeenCalled();
  });

  it("loads effects on open and renders a card", async () => {
    render(<EffectGallery open onClose={() => {}} onInsert={() => {}} />);
    await waitFor(() => expect(screen.getByText("遮罩揭答")).toBeInTheDocument());
    expect(effectApi.fetchEffects).toHaveBeenCalled();
  });

  it("enters the slot form when a card is selected", async () => {
    render(<EffectGallery open onClose={() => {}} onInsert={() => {}} />);
    await waitFor(() => screen.getByText("遮罩揭答"));
    fireEvent.click(screen.getByText("填槽"));
    // slot label + submit button appear in form view
    await waitFor(() => expect(screen.getByText(/生成并插入/)).toBeInTheDocument());
    expect(screen.getByText("答案")).toBeInTheDocument();
  });

  it("submits slot values and calls onInsert with rendered html", async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    render(<EffectGallery open onClose={onClose} onInsert={onInsert} />);
    await waitFor(() => screen.getByText("遮罩揭答"));
    fireEvent.click(screen.getByText("填槽"));
    await waitFor(() => screen.getByText(/生成并插入/));
    fireEvent.click(screen.getByText(/生成并插入/));
    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("<svg>OK</svg>"));
    expect(effectApi.renderEffect).toHaveBeenCalledWith("mask-reveal", expect.any(Object));
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onInsert when backend returns error status", async () => {
    vi.mocked(effectApi.renderEffect).mockResolvedValueOnce({
      status: "error",
      html: "",
      warnings: [],
      report: null,
      message: "未知效果 id: xxx",
    });
    const onInsert = vi.fn();
    render(<EffectGallery open onClose={() => {}} onInsert={onInsert} />);
    await waitFor(() => screen.getByText("遮罩揭答"));
    fireEvent.click(screen.getByText("填槽"));
    await waitFor(() => screen.getByText(/生成并插入/));
    fireEvent.click(screen.getByText(/生成并插入/));
    await waitFor(() => expect(effectApi.renderEffect).toHaveBeenCalled());
    expect(onInsert).not.toHaveBeenCalled();
  });
});
