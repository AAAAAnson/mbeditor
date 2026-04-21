import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSurface } from "./SettingsSurface";
import { useWeChatStore } from "@/stores/wechatStore";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { code: 0, message: "ok", data: { valid: true } } }),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  useWeChatStore.getState().reset();
});

describe("SettingsSurface WeChat section", () => {
  it("adds a new account through the form and persists to store", async () => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /添加公众号|add account/i }));

    fireEvent.change(screen.getByLabelText(/名称|account name/i), { target: { value: "MB 科技" } });
    fireEvent.change(screen.getByLabelText(/appid/i), { target: { value: "wxa7b6e6test" } });
    fireEvent.change(screen.getByLabelText(/appsecret/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));

    await waitFor(() => {
      expect(useWeChatStore.getState().accounts).toHaveLength(1);
    });
    expect(useWeChatStore.getState().accounts[0].appid).toBe("wxa7b6e6test");
  });

  it("calls /wechat/test-connection with active account creds", async () => {
    useWeChatStore.getState().addAccount({ name: "Existing", appid: "wxA", appsecret: "s" });
    const { default: api } = await import("@/lib/api");

    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole("button", { name: /测试连接|test connection/i }));

    await waitFor(() => {
      expect((api.post as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "/wechat/test-connection",
        { appid: "wxA", appsecret: "s" },
      );
    });
  });

  it("renders 图床 nav entry and section", async () => {
    render(<SettingsSurface go={vi.fn()} />);
    const navBtn = screen.getByRole("button", { name: "图床" });
    fireEvent.click(navBtn);
    await waitFor(() => {
      expect(screen.getByTestId("imagehost-section")).toBeInTheDocument();
    });
  });
});
