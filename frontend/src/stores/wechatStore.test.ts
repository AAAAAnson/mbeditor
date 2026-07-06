// frontend/src/stores/wechatStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useWeChatStore } from "./wechatStore";

describe("wechatStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWeChatStore.getState().reset();
  });

  it("starts empty", () => {
    const state = useWeChatStore.getState();
    expect(state.accounts).toEqual([]);
    expect(state.activeAccountId).toBeNull();
  });

  it("adds an account and activates it", () => {
    const id = useWeChatStore.getState().addAccount({ name: "MB", appid: "wxA", appsecret: "sec" });
    const state = useWeChatStore.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].id).toBe(id);
    expect(state.activeAccountId).toBe(id);
    expect(state.getActiveAccount()?.appid).toBe("wxA");
  });

  it("updates an existing account", () => {
    const id = useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "s1" });
    useWeChatStore.getState().updateAccount(id, { name: "A2", appsecret: "s2" });
    const acct = useWeChatStore.getState().getActiveAccount();
    expect(acct?.name).toBe("A2");
    expect(acct?.appsecret).toBe("s2");
    expect(acct?.appid).toBe("wxA");
  });

  it("removes an account and reassigns activeAccountId", () => {
    const a = useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "s" });
    const b = useWeChatStore.getState().addAccount({ name: "B", appid: "wxB", appsecret: "s" });
    useWeChatStore.getState().removeAccount(a);
    const state = useWeChatStore.getState();
    expect(state.accounts.map((x) => x.id)).toEqual([b]);
    expect(state.activeAccountId).toBe(b);
  });

  it("persists to localStorage under mbeditor.wechat", () => {
    useWeChatStore.getState().addAccount({ name: "A", appid: "wxA", appsecret: "wechat-secret" });
    const raw = localStorage.getItem("mbeditor.wechat");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accounts[0].appid).toBe("wxA");
    expect(parsed.state.accounts[0]).not.toHaveProperty("appsecret");
    expect(raw).not.toContain("wechat-secret");
  });

  it("scrubs legacy persisted appsecret values during rehydrate", async () => {
    localStorage.setItem(
      "mbeditor.wechat",
      JSON.stringify({
        state: {
          accounts: [{ id: "acct_1", name: "A", appid: "wxA", appsecret: "legacy-secret" }],
          activeAccountId: "acct_1",
        },
        version: 0,
      })
    );

    await useWeChatStore.persist.rehydrate();

    expect(useWeChatStore.getState().accounts[0]).toEqual({
      id: "acct_1",
      name: "A",
      appid: "wxA",
      appsecret: "",
    });
    expect(localStorage.getItem("mbeditor.wechat")).not.toContain("legacy-secret");
  });
});
