// H5:草稿箱 gate 判据放宽——内存密钥 OR 服务器已存密钥(appid 在 configured 列表)。
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWeChatStore } from "@/stores/wechatStore";

const getCredentialsMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>());
vi.mock("@/surfaces/settings/credentialsApi", () => ({
  getCredentials: () => getCredentialsMock(),
  putCredential: vi.fn(),
}));

import { useWeChatPushable } from "./useWeChatPushable";

function addActive(account: { name: string; appid: string; appsecret: string }) {
  const id = useWeChatStore.getState().addAccount(account);
  useWeChatStore.getState().setActive(id);
  return id;
}

beforeEach(() => {
  localStorage.clear();
  useWeChatStore.getState().reset();
  getCredentialsMock.mockReset();
  getCredentialsMock.mockResolvedValue([]);
});

describe("useWeChatPushable", () => {
  it("无活跃账号 → canPush false、account null,且不白发 credentials 请求", async () => {
    const { result } = renderHook(() => useWeChatPushable());
    expect(result.current.canPush).toBe(false);
    expect(result.current.account).toBeNull();
    await Promise.resolve();
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(result.current.canPush).toBe(false);
  });

  it("内存有 appsecret → 立即 true(不必等服务器列表)", () => {
    addActive({ name: "号A", appid: "wxMem", appsecret: "s3cret" });
    const { result } = renderHook(() => useWeChatPushable());
    expect(result.current.canPush).toBe(true);
    expect(result.current.account?.appid).toBe("wxMem");
  });

  it("内存无密钥但 appid 在服务器 configured 列表 → true(回访用户不再被降级)", async () => {
    getCredentialsMock.mockResolvedValue(["wxSrv", "wxOther"]);
    addActive({ name: "号B", appid: "wxSrv", appsecret: "" });
    const { result } = renderHook(() => useWeChatPushable());
    await waitFor(() => expect(result.current.canPush).toBe(true));
  });

  it("内存无密钥且服务器列表不含该 appid → false", async () => {
    getCredentialsMock.mockResolvedValue(["wxOther"]);
    addActive({ name: "号C", appid: "wxNone", appsecret: "" });
    const { result } = renderHook(() => useWeChatPushable());
    await waitFor(() => expect(getCredentialsMock).toHaveBeenCalled());
    expect(result.current.canPush).toBe(false);
  });

  it("getCredentials 拒绝 → 静默降级为空列表(不抛、不误开)", async () => {
    getCredentialsMock.mockRejectedValue(new Error("network down"));
    addActive({ name: "号D", appid: "wxSrv", appsecret: "" });
    const { result } = renderHook(() => useWeChatPushable());
    await waitFor(() => expect(getCredentialsMock).toHaveBeenCalled());
    expect(result.current.canPush).toBe(false);
  });

  it("活跃号 appid 变化 → 重新拉服务器列表", async () => {
    getCredentialsMock.mockResolvedValue(["wxB"]);
    addActive({ name: "A", appid: "wxA", appsecret: "" });
    const { result } = renderHook(() => useWeChatPushable());
    await waitFor(() => expect(getCredentialsMock).toHaveBeenCalledTimes(1));
    expect(result.current.canPush).toBe(false);

    const idB = useWeChatStore.getState().addAccount({ name: "B", appid: "wxB", appsecret: "" });
    useWeChatStore.getState().setActive(idB);
    await waitFor(() => expect(getCredentialsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.canPush).toBe(true));
  });
});
