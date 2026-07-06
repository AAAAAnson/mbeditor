// revisionsApi:URL / body / 信封解包契约。底下 axios 实例换 mock。
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from "@/lib/api";
import {
  RevisionsApiError,
  getRevision,
  listRevisions,
  postRevision,
} from "@/lib/revisionsApi";

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

function envelope<T>(data: T, code = 0, message = "") {
  return { data: { code, message, data } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revisionsApi", () => {
  it("listRevisions 解 success 信封并回 revisions 数组", async () => {
    const rows = [{ rev_id: "r2", ts: 2, reason: "ai_adopt" }];
    mockedApi.get.mockResolvedValue(envelope({ revisions: rows }));
    const result = await listRevisions("art 1");
    expect(mockedApi.get).toHaveBeenCalledWith("/revisions/art%201");
    expect(result).toEqual(rows);
  });

  it("listRevisions 缺 revisions 字段回空数组", async () => {
    mockedApi.get.mockResolvedValue(envelope({}));
    expect(await listRevisions("a")).toEqual([]);
  });

  it("getRevision 解信封回完整快照(含 html)", async () => {
    mockedApi.get.mockResolvedValue(envelope({ rev_id: "r1", html: "<p>旧</p>", reason: "chat_turn" }));
    const rev = await getRevision("a1", "r1");
    expect(mockedApi.get).toHaveBeenCalledWith("/revisions/a1/r1");
    expect(rev.html).toBe("<p>旧</p>");
  });

  it("getRevision html 非字符串 → 抛错", async () => {
    mockedApi.get.mockResolvedValue(envelope({ rev_id: "r1" }));
    await expect(getRevision("a1", "r1")).rejects.toBeInstanceOf(RevisionsApiError);
  });

  it("postRevision 提交 html/reason 并回 rev_id", async () => {
    mockedApi.post.mockResolvedValue(envelope({ rev_id: "rev_new" }));
    const id = await postRevision("a1", "<p>快照</p>", "ai_adopt");
    expect(mockedApi.post).toHaveBeenCalledWith("/revisions/a1", {
      html: "<p>快照</p>",
      reason: "ai_adopt",
    });
    expect(id).toBe("rev_new");
  });

  it("postRevision code!=0 → 抛带 code 的错误", async () => {
    mockedApi.post.mockResolvedValue(envelope(null, 500, "写入失败"));
    await expect(postRevision("a1", "x", "ai_adopt")).rejects.toMatchObject({
      code: 500,
      message: "写入失败",
    });
  });

  it("postRevision 缺 rev_id → 抛错", async () => {
    mockedApi.post.mockResolvedValue(envelope({}));
    await expect(postRevision("a1", "x", "ai_adopt")).rejects.toBeInstanceOf(RevisionsApiError);
  });
});
