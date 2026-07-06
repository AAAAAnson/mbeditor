import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./voiceApi", () => ({
  getVoice: vi.fn(),
  learnVoice: vi.fn(),
  clearVoice: vi.fn(),
}));
vi.mock("@/stores/toastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import BrandVoiceSection from "./BrandVoiceSection";
import { getVoice, learnVoice, clearVoice } from "./voiceApi";

const mockGet = getVoice as unknown as ReturnType<typeof vi.fn>;
const mockLearn = learnVoice as unknown as ReturnType<typeof vi.fn>;
const mockClear = clearVoice as unknown as ReturnType<typeof vi.fn>;

const VOICE = {
  updated_at: "2026-06-15T10:00:00Z",
  source_excerpt: "上周末带娃去海洋馆…",
  traits: { tone: "温柔治愈", signatures: ["晚安啦"], cadence: "短句多", banned_words: ["最", "第一"] },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("BrandVoiceSection", () => {
  it("renders Warm scaffold heading and two cards", async () => {
    mockGet.mockResolvedValue(null);
    const { container } = render(<BrandVoiceSection />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "音色档案" })).toBeInTheDocument();
    });
    // 双卡:笔法特征卡 + 贴旧文卡(.ss-card === .mb-card 基类)。
    expect(container.querySelectorAll(".ss-card").length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty state when no profile learned", async () => {
    mockGet.mockResolvedValue(null);
    render(<BrandVoiceSection />);
    await waitFor(() => {
      expect(screen.getByTestId("voice-empty")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /清空/ })).not.toBeInTheDocument();
  });

  it("does not crash on a malformed voice with null traits — falls back to empty state", async () => {
    // 防御纵深:即便有坏数据(traits 为空)漏到组件,也不能整页崩(黑屏)——
    // 守卫到 voice.traits 才渲染卡片,否则退回空态。
    mockGet.mockResolvedValue({ traits: null });
    render(<BrandVoiceSection />);
    await waitFor(() => {
      expect(screen.getByTestId("voice-empty")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("voice-traits")).not.toBeInTheDocument();
  });

  it("renders learned traits (tone / signatures / cadence / banned_words)", async () => {
    mockGet.mockResolvedValue(VOICE);
    render(<BrandVoiceSection />);
    await waitFor(() => {
      expect(screen.getByTestId("voice-traits")).toBeInTheDocument();
    });
    expect(screen.getByText("温柔治愈")).toBeInTheDocument();
    expect(screen.getByText("晚安啦")).toBeInTheDocument();
    expect(screen.getByText("短句多")).toBeInTheDocument();
    expect(screen.getByText("最")).toBeInTheDocument();
    expect(screen.getByText("第一")).toBeInTheDocument();
  });

  it("signatures render as orange DS Tags; banned words as danger DS Tags", async () => {
    mockGet.mockResolvedValue(VOICE);
    render(<BrandVoiceSection />);
    await waitFor(() => expect(screen.getByTestId("voice-traits")).toBeInTheDocument());

    const sig = screen.getByText("晚安啦").closest(".mb-tag");
    expect(sig).not.toBeNull();
    expect(sig).toHaveClass("tone-orange");

    const banned = screen.getByText("最").closest(".mb-tag");
    expect(banned).not.toBeNull();
    expect(banned).toHaveClass("tone-danger");
  });

  it("empty state uses the Warm .ss-empty round chip", async () => {
    mockGet.mockResolvedValue(null);
    const { container } = render(<BrandVoiceSection />);
    await waitFor(() => expect(screen.getByTestId("voice-empty")).toBeInTheDocument());
    expect(container.querySelector(".ss-empty")).not.toBeNull();
    expect(container.querySelector(".ss-emptyico")).not.toBeNull();
  });

  it("learns from pasted sample and refreshes traits", async () => {
    mockGet.mockResolvedValue(null);
    mockLearn.mockResolvedValue(VOICE);
    render(<BrandVoiceSection />);
    await waitFor(() => expect(screen.getByLabelText("旧文样本")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("旧文样本"), { target: { value: "贴的旧文全文" } });
    fireEvent.click(screen.getByRole("button", { name: /开始学习|重新学习/ }));

    await waitFor(() => {
      expect(mockLearn).toHaveBeenCalledWith("贴的旧文全文");
    });
    await waitFor(() => {
      expect(screen.getByText("温柔治愈")).toBeInTheDocument();
    });
  });

  it("learn button disabled when sample blank", async () => {
    mockGet.mockResolvedValue(null);
    render(<BrandVoiceSection />);
    await waitFor(() => expect(screen.getByLabelText("旧文样本")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /开始学习|重新学习/ })).toBeDisabled();
  });

  it("clears the profile and shows empty state", async () => {
    mockGet.mockResolvedValue(VOICE);
    mockClear.mockResolvedValue(undefined);
    render(<BrandVoiceSection />);
    await waitFor(() => expect(screen.getByTestId("voice-traits")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /清空/ }));
    await waitFor(() => {
      expect(mockClear).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId("voice-empty")).toBeInTheDocument();
    });
  });
});
