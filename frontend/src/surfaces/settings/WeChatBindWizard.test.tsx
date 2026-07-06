import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

import WeChatBindWizard from "./WeChatBindWizard";

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  post.mockReset();
});

describe("WeChatBindWizard", () => {
  it("下一步 disabled until AppID entered", () => {
    render(<WeChatBindWizard configured={[]} onBound={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /下一步/ })).toBeDisabled();
  });

  it("测试连接未通过则无确认绑定按钮、onBound 不触发", () => {
    const onBound = vi.fn();
    render(<WeChatBindWizard configured={[]} onBound={onBound} onCancel={vi.fn()} />);
    fill("名称", "张姐的小厨房");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    expect(screen.queryByRole("button", { name: /确认绑定/ })).toBeNull();
    expect(onBound).not.toHaveBeenCalled();
  });

  it("测试连接失败:展示错误、不触发 onBound", async () => {
    const onBound = vi.fn();
    post.mockRejectedValueOnce(new Error("invalid appsecret"));
    render(<WeChatBindWizard configured={[]} onBound={onBound} onCancel={vi.fn()} />);
    fill("名称", "号A");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByText(/连接失败/)).toBeInTheDocument());
    expect(onBound).not.toHaveBeenCalled();
  });

  it("测试连接失败:优先透出后端可行动 message(如 IP 白名单),保留「连接失败」前缀", async () => {
    const onBound = vi.fn();
    post.mockResolvedValueOnce({
      data: {
        code: 500,
        message: "微信凭证获取失败:公众号 IP 白名单未放行:请登录公众号后台把发布服务器出口 IP 加入白名单后重试",
      },
    });
    render(<WeChatBindWizard configured={[]} onBound={onBound} onCancel={vi.fn()} />);
    fill("名称", "号A");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByText(/白名单/)).toBeInTheDocument());
    expect(screen.getByText(/连接失败/)).toBeInTheDocument();
    // 后端 message 在时不再指错方向到「检查 AppID / AppSecret」
    expect(screen.queryByText(/请检查 AppID/)).toBeNull();
    expect(onBound).not.toHaveBeenCalled();
  });

  it("测试连接失败:后端 message 为空才落「请检查 AppID / AppSecret」兜底", async () => {
    post.mockResolvedValueOnce({ data: { code: 500 } });
    render(<WeChatBindWizard configured={[]} onBound={vi.fn()} onCancel={vi.fn()} />);
    fill("名称", "号A");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByText(/连接失败/)).toBeInTheDocument());
    expect(screen.getByText(/请检查 AppID \/ AppSecret/)).toBeInTheDocument();
  });

  it("测试连接成功:解锁确认绑定,点击后 onBound 收到 {name,appid,appsecret}", async () => {
    const onBound = vi.fn();
    post.mockResolvedValueOnce({ data: { code: 0, data: { valid: true } } });
    render(<WeChatBindWizard configured={[]} onBound={onBound} onCancel={vi.fn()} />);
    fill("名称", "号A");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    const confirm = await screen.findByRole("button", { name: /确认绑定/ });
    fireEvent.click(confirm);
    expect(onBound).toHaveBeenCalledWith({ name: "号A", appid: "wxAppId", appsecret: "secretX" });
    expect(post).toHaveBeenCalledWith("/wechat/test-connection", { appid: "wxAppId", appsecret: "secretX" });
  });

  it("闸门:测连接成功后改 AppSecret 重置 tested,确认绑定按钮消失", async () => {
    const onBound = vi.fn();
    post.mockResolvedValueOnce({ data: { code: 0, data: { valid: true } } });
    render(<WeChatBindWizard configured={[]} onBound={onBound} onCancel={vi.fn()} />);
    fill("名称", "号A");
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fill("AppSecret", "secretX");
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await screen.findByRole("button", { name: /确认绑定/ });
    // 改密钥 → tested 重置 → 确认绑定按钮消失
    fill("AppSecret", "secretY");
    expect(screen.queryByRole("button", { name: /确认绑定/ })).toBeNull();
    expect(onBound).not.toHaveBeenCalled();
  });

  it("完整档:渲染 role=dialog 的 overlay 模态", () => {
    render(<WeChatBindWizard configured={[]} onBound={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("wechat-bind-wizard")).toBeInTheDocument();
  });

  it("完整档:点关闭 X 触发 onCancel", () => {
    const onCancel = vi.fn();
    render(<WeChatBindWizard configured={[]} onBound={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("完整档:step1 点上一步回到 step0", () => {
    render(<WeChatBindWizard configured={[]} onBound={vi.fn()} onCancel={vi.fn()} />);
    fill("AppID", "wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    // step1: AppSecret 输入存在、下一步消失
    expect(screen.getByLabelText("AppSecret")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /下一步/ })).toBeNull();
    // 点上一步 → 回 step0
    fireEvent.click(screen.getByRole("button", { name: /上一步/ }));
    expect(screen.getByRole("button", { name: /下一步/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("AppSecret")).toBeNull();
  });

  it("编辑态:回填 name/appid;configured 含 appid 时 AppSecret 可留空提示", () => {
    render(
      <WeChatBindWizard
        configured={["wxAppId"]}
        account={{ id: "1", name: "号A", appid: "wxAppId", appsecret: "" }}
        onBound={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("名称") as HTMLInputElement).value).toBe("号A");
    expect((screen.getByLabelText("AppID") as HTMLInputElement).value).toBe("wxAppId");
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    expect(screen.getByText(/可留空/)).toBeInTheDocument();
  });
});
