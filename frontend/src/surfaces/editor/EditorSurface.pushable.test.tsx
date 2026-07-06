// H5:EditorSurface 的 canSendToDraft gate 不再只看内存 appsecret——
// 活跃号 appid 在服务器 configured 列表(密钥已存服务端)同样放行。
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticlesStore } from "@/stores/articlesStore";
import { useWeChatStore } from "@/stores/wechatStore";

const getCredentialsMock = vi.hoisted(() => vi.fn<() => Promise<string[]>>(async () => []));
vi.mock("@/surfaces/settings/credentialsApi", () => ({
  getCredentials: () => getCredentialsMock(),
  putCredential: vi.fn(),
}));

// 收窄成探针:只透出 canSendToDraft 判定结果。
vi.mock("@/components/progress/CopyReadyDialog", () => ({
  default: (props: { canSendToDraft?: boolean }) => (
    <div data-testid="copy-ready-probe" data-cansend={String(Boolean(props.canSendToDraft))} />
  ),
}));
vi.mock("./CenterStage", () => ({ default: () => null }));
vi.mock("@/features/editor/lint/LintSidebar", () => ({ default: () => null }));

import EditorSurface from "./EditorSurface";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useWeChatStore.getState().reset();
  useArticlesStore.setState({ articles: [], currentArticleId: null, loading: false });
  getCredentialsMock.mockClear();
  getCredentialsMock.mockResolvedValue([]);
});

afterEach(() => cleanup());

async function renderWithAccount(appid: string, appsecret: string) {
  const id = useWeChatStore.getState().addAccount({ name: "号A", appid, appsecret });
  useWeChatStore.getState().setActive(id);
  const a = await useArticlesStore.getState().createArticle("稿件", "html");
  render(<EditorSurface articleId={a.id} go={vi.fn()} canGoBack />);
}

describe("EditorSurface 草稿箱 gate(useWeChatPushable)", () => {
  it("内存无密钥但 appid 在服务器 configured 列表 → canSendToDraft=true", async () => {
    getCredentialsMock.mockResolvedValue(["wxSrv"]);
    await renderWithAccount("wxSrv", "");
    await waitFor(() =>
      expect(screen.getByTestId("copy-ready-probe")).toHaveAttribute("data-cansend", "true"),
    );
  });

  it("内存无密钥且服务器列表不含 → canSendToDraft=false", async () => {
    getCredentialsMock.mockResolvedValue(["wxOther"]);
    await renderWithAccount("wxNone", "");
    await waitFor(() => expect(getCredentialsMock).toHaveBeenCalled());
    expect(screen.getByTestId("copy-ready-probe")).toHaveAttribute("data-cansend", "false");
  });

  it("内存有密钥(本会话刚绑)→ 直接 true", async () => {
    await renderWithAccount("wxMem", "live-secret");
    await waitFor(() =>
      expect(screen.getByTestId("copy-ready-probe")).toHaveAttribute("data-cansend", "true"),
    );
  });
});
