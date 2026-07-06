import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { ReadableStream as NodeReadableStream } from "node:stream/web";

// Monaco can't run in jsdom (it needs canvas / web workers / ResizeObserver
// internals that the DOM shim doesn't provide). Globally swap @monaco-editor/react
// for a plain <textarea> that mirrors the value/onChange contract the code drawer
// relies on, so editor tests can drive source edits with fireEvent.change. The
// data-testid keeps the real Monaco instance unmocked in the running app.
vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    options,
    "data-testid": dataTestId,
  }: {
    value?: string;
    onChange?: (value: string | undefined) => void;
    options?: { fontSize?: number };
    "data-testid"?: string;
  }) => {
    const React = require("react");
    return React.createElement("textarea", {
      "data-testid": dataTestId ?? "code-monaco",
      // Surface options.fontSize so tests can assert the editor font size wiring.
      "data-font-size": options?.fontSize ?? "",
      value: value ?? "",
      onChange: (event: { target: { value: string } }) => onChange?.(event.target.value),
    });
  },
}));

// articlesStore 批2 起写穿后端(/api/v1/articles)。jsdom 里真发请求只会
// ECONNREFUSED + 噪音,全局换成行为等价的默认 mock(PUT 回执原样 echo,
// 列表为空):既有消费方测试零改仍绿。需要真实实现的测试(articlesApi.test.ts)
// 用 vi.unmock 还原;需要驱动失败/冲突分支的测试直接改这些 vi.fn 的实现。
vi.mock("@/lib/articlesApi", () => {
  class ArticlesApiError extends Error {
    code: number;
    constructor(message: string, code: number) {
      super(message);
      this.name = "ArticlesApiError";
      this.code = code;
    }
  }
  return {
    ArticlesApiError,
    listArticles: vi.fn(async () => []),
    getArticle: vi.fn(async () => {
      throw new ArticlesApiError("文章不存在", 404);
    }),
    putArticle: vi.fn(async (article: { id: string; updated_at?: string }) => ({
      article: { ...article, deleted_at: null },
      conflict_rev_id: null,
    })),
    deleteArticle: vi.fn(async () => undefined),
    restoreArticle: vi.fn(async (id: string) => ({ id, deleted_at: null })),
    purgeArticle: vi.fn(async () => undefined),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Drop any vi.stubGlobal (e.g. mockMatchMedia) so a narrow-viewport stub never
  // leaks into the next file/test. matchMedia is the highest cross-file pollution
  // risk this phase (see memory mbeditor-test-quirks).
  vi.unstubAllGlobals();
});

// jsdom doesn't implement window.matchMedia. Default to matches:false (desktop) so
// every existing test keeps its behaviour; mobile cases opt in via the
// src/test-helpers/matchMedia.ts mockMatchMedia(true) helper before render.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Polyfill Blob.prototype.text for jsdom environment (jsdom <25 lacks Blob.text)
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// Polyfill Blob.prototype.arrayBuffer for jsdom environment (jsdom <25 lacks Blob.arrayBuffer).
// Use Response() rather than FileReader so the polyfill works under vi.useFakeTimers().
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Response(this).arrayBuffer();
  };
}

// Polyfill ReadableStream for the vmThreads pool: Node's isolated-VM context does not
// expose the global ReadableStream, and jsdom doesn't provide one. fetch-based SSE
// streaming tests (lib/agentStream) construct `new ReadableStream(...)` and read
// `response.body.getReader()`, so make Node's web-streams ReadableStream global.
if (typeof (globalThis as { ReadableStream?: unknown }).ReadableStream === "undefined") {
  (globalThis as { ReadableStream?: unknown }).ReadableStream = NodeReadableStream;
}
