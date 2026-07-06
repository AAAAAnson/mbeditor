import { describe, expect, it } from "vitest";
import api, { friendlyErrorMessage, rewriteAxiosError } from "./api";

describe("friendlyErrorMessage", () => {
  it("把网络错误(无 response)映射成中文", () => {
    expect(friendlyErrorMessage({ message: "Network Error" })).toBe(
      "网络连接失败,请检查网络后重试"
    );
  });

  it("把超时(ECONNABORTED)映射成中文", () => {
    expect(
      friendlyErrorMessage({ code: "ECONNABORTED", message: "timeout of 30000ms exceeded" })
    ).toBe("请求超时,请稍后重试");
  });

  it("把 message 含 timeout 的错误也判为超时", () => {
    expect(friendlyErrorMessage({ message: "timeout exceeded" })).toBe(
      "请求超时,请稍后重试"
    );
  });

  it("把取消(ERR_CANCELED)映射成中文", () => {
    expect(friendlyErrorMessage({ code: "ERR_CANCELED", message: "canceled" })).toBe(
      "请求已取消"
    );
  });

  it("把 400 映射成中文", () => {
    expect(friendlyErrorMessage({ response: { status: 400 }, message: "Request failed with status code 400" })).toBe(
      "请求参数有误,请检查后重试"
    );
  });

  it("把 404 映射成中文", () => {
    expect(friendlyErrorMessage({ response: { status: 404 } })).toBe("请求的资源不存在");
  });

  it("把 413 映射成中文", () => {
    expect(friendlyErrorMessage({ response: { status: 413 } })).toBe("上传内容过大");
  });

  it("把 422 映射成中文(忽略数组 detail)", () => {
    expect(
      friendlyErrorMessage({ response: { status: 422, data: { detail: [{ msg: "field required" }] } } })
    ).toBe("提交的内容格式不正确");
  });

  it("把 500 映射成中文(不回显 str(exc))", () => {
    const msg = friendlyErrorMessage({
      response: { status: 500, data: { code: 500, message: "Traceback secret /app/data/x" } },
      message: "Request failed with status code 500",
    });
    expect(msg).toBe("服务器开小差了,请稍后重试");
    expect(msg).not.toContain("Traceback");
  });

  it("把 503 映射成中文", () => {
    expect(friendlyErrorMessage({ response: { status: 503 } })).toBe("服务暂时不可用,请稍后重试");
  });

  it("未列举的 4xx 走中文兜底带状态码", () => {
    expect(friendlyErrorMessage({ response: { status: 418 } })).toBe(
      "请求失败(状态码 418),请稍后重试"
    );
  });

  it("未列举的 5xx 走中文兜底带状态码", () => {
    expect(friendlyErrorMessage({ response: { status: 599 } })).toBe(
      "服务器错误(状态码 599),请稍后重试"
    );
  });

  it("绝不返回 axios 英文原文", () => {
    for (const err of [
      { message: "Network Error" },
      { code: "ECONNABORTED", message: "timeout of 30000ms exceeded" },
      { response: { status: 500 }, message: "Request failed with status code 500" },
    ]) {
      const msg = friendlyErrorMessage(err);
      expect(msg).not.toMatch(/Request failed|Network Error|timeout of/i);
    }
  });
});

describe("rewriteAxiosError", () => {
  it("改写 error.message 为中文,保留 response 结构与 config,但对 5xx 净化 response.data.message(防 str(exc) 经 helper 泄漏)", async () => {
    const original = {
      message: "Request failed with status code 500",
      code: "ERR_BAD_RESPONSE",
      config: { url: "/settings/llm" },
      response: { status: 500, data: { code: 500, message: "KeyError /app/data/gateway.json at services/gateway.py:42" } },
    };

    await expect(rewriteAxiosError(original)).rejects.toBe(original);

    expect(original.message).toBe("服务器开小差了,请稍后重试");
    // response 结构保留(getErrorMessage / extractErrorMessage 仍读 response.data),
    expect(original.response.status).toBe(500);
    expect(original.response.data.code).toBe(500);
    // 但 5xx 的 message 被净化成友好中文 —— 不把后端 str(exc)/内部路径漏给 helper(敏感数据准则)。
    expect(original.response.data.message).toBe("服务器开小差了,请稍后重试");
    expect(JSON.stringify(original.response)).not.toContain("app/data");
    expect(original.config).toEqual({ url: "/settings/llm" });
  });

  it("4xx 的 response.data.message 不被改写(如 413 后端中文「请求体过大。」)", async () => {
    const original = {
      message: "Request failed with status code 413",
      response: { status: 413, data: { code: 413, message: "请求体过大。" } },
    };
    await expect(rewriteAxiosError(original)).rejects.toBe(original);
    expect(original.message).toBe("上传内容过大");
    expect(original.response.data.message).toBe("请求体过大。");
  });

  it("5xx 但 response.data 无 message 字段时不报错、不新增字段(如 FastAPI 422/数组 detail)", async () => {
    const original = {
      message: "Request failed with status code 502",
      response: { status: 502, data: { detail: [{ msg: "boom" }] } },
    };
    await expect(rewriteAxiosError(original)).rejects.toBe(original);
    expect(original.message).toBe("网关错误,服务暂时不可用,请稍后重试");
    expect(original.response.data).toEqual({ detail: [{ msg: "boom" }] });
  });

  it("网络错误也改写 message,response 仍为 undefined", async () => {
    const original: { message: string; response?: unknown } = { message: "Network Error" };
    await expect(rewriteAxiosError(original)).rejects.toBe(original);
    expect(original.message).toBe("网络连接失败,请检查网络后重试");
    expect(original.response).toBeUndefined();
  });

  it("非对象 reject 值原样透传", async () => {
    await expect(rewriteAxiosError("plain string")).rejects.toBe("plain string");
  });
});

describe("api 实例", () => {
  it("已注册一个 response 错误 interceptor", () => {
    const handlers = (api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: unknown } | null>;
    }).handlers;
    const active = handlers.filter((h) => h && typeof h.rejected === "function");
    expect(active.length).toBeGreaterThanOrEqual(1);
  });
});
