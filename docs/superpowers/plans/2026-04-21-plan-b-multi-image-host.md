# Multi Image-Host Support — Plan B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload editor images to any of 5 image hosts (default WeChat proxy, GitHub, Aliyun OSS, Tencent COS, Cloudflare R2), with credentials stored in browser localStorage only. Pattern mirrors github.com/doocs/md apps/web/src/utils/file.ts.

**Architecture:** Frontend-only feature (except the already-existing WeChat proxy endpoint from Plan A). A shared `ImageHostEngine` interface has five implementations under `frontend/src/lib/image-hosts/`. A new Zustand+persist `imageHostStore` holds per-engine config and the active engine id. Settings UI gains a 图床 tab with engine picker + dynamic config form + test-upload button. Editor upload call site delegates to the active engine.

**Tech Stack:** React 19, Zustand+persist, TypeScript, ali-oss, cos-js-sdk-v5, @aws-sdk/client-s3 (for R2), vitest, Playwright.

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `frontend/src/lib/image-hosts/types.ts` | `ImageHostEngine`, `UploadResult`, config typings, shared engine id union. |
| `frontend/src/lib/image-hosts/registry.ts` | Exports the engine map keyed by id + `getEngine(id)` / `listEngines()` helpers. |
| `frontend/src/lib/image-hosts/default.ts` | WeChat proxy engine — POSTs file to `/api/v1/wechat/upload-image` with active account creds. |
| `frontend/src/lib/image-hosts/github.ts` | GitHub engine — PUT to `api.github.com/repos/{repo}/contents/{path}`. |
| `frontend/src/lib/image-hosts/aliyun.ts` | Aliyun OSS engine — wraps `ali-oss` browser client. |
| `frontend/src/lib/image-hosts/tencent-cos.ts` | Tencent COS engine — wraps `cos-js-sdk-v5`. |
| `frontend/src/lib/image-hosts/cloudflare-r2.ts` | Cloudflare R2 engine — `@aws-sdk/client-s3` with R2 endpoint. |
| `frontend/src/lib/image-hosts/filename.ts` | `buildObjectKey(file)` → `YYYY/MM/<uuid>.<ext>` (shared across engines). |
| `frontend/src/lib/image-hosts/__tests__/default.test.ts` | Unit test for default (WeChat proxy) engine. |
| `frontend/src/lib/image-hosts/__tests__/github.test.ts` | Unit test for GitHub engine (fetch mocked). |
| `frontend/src/lib/image-hosts/__tests__/aliyun.test.ts` | Unit test for Aliyun OSS engine (`ali-oss` mocked). |
| `frontend/src/lib/image-hosts/__tests__/tencent-cos.test.ts` | Unit test for Tencent COS engine (SDK mocked). |
| `frontend/src/lib/image-hosts/__tests__/cloudflare-r2.test.ts` | Unit test for R2 engine (AWS SDK mocked). |
| `frontend/src/lib/image-hosts/__tests__/filename.test.ts` | Unit test for `buildObjectKey`. |
| `frontend/src/stores/imageHostStore.ts` | Zustand+persist store, key `mbeditor.imagehost`. |
| `frontend/src/stores/__tests__/imageHostStore.test.ts` | Unit test — defaults, set config, switch active, persistence round-trip. |
| `frontend/src/surfaces/settings/ImageHostsSection.tsx` | Settings 图床 tab UI. |
| `frontend/src/surfaces/settings/ImageHostsSection.test.tsx` | Unit tests for the settings tab (render, switch, test-upload). |
| `scripts/verify_image_host_settings.py` | Playwright E2E — picks GitHub, mocks upload, asserts success toast. |

### Modified files

| Path | Change |
| --- | --- |
| `frontend/package.json` | Add deps `ali-oss`, `@types/ali-oss`, `cos-js-sdk-v5`, `@aws-sdk/client-s3`, `uuid`, `@types/uuid`. |
| `frontend/src/surfaces/settings/SettingsSurface.tsx` | Add `"imagehost"` to `Section` union, new nav entry 「图床」, render `<ImageHostsSection />`. |
| `frontend/src/surfaces/settings/SettingsSurface.test.tsx` | Extend suite — click 「图床」 nav, assert engine picker appears. |
| `frontend/src/surfaces/editor/CenterStage.tsx` | Replace existing image upload path with `getActiveEngine().upload(file, config)`. |
| `frontend/src/surfaces/editor/CenterStage.test.tsx` | Update to mock `imageHostStore` + `getEngine('default').upload`. |

---

## Stage 1: Engine interface + store

### Task 1: Add shared types

**Files:** `frontend/src/lib/image-hosts/types.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/types.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import type { ImageHostEngine, ImageHostId, UploadResult } from "../types";

  describe("image-host types", () => {
    it("exposes the five engine ids", () => {
      const ids: ImageHostId[] = ["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"];
      expect(ids).toHaveLength(5);
    });

    it("engine interface is structurally typed", () => {
      const fake: ImageHostEngine<{ token: string }> = {
        id: "github",
        label: "GitHub",
        isConfigured: (c) => Boolean(c?.token),
        upload: async () => ({ url: "https://x" } satisfies UploadResult),
      };
      expect(fake.isConfigured({ token: "t" })).toBe(true);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/types.test.ts`
  Expected: `Cannot find module '../types'`.
- [ ] Step 3: Implement minimal code
  Create `frontend/src/lib/image-hosts/types.ts`:
  ```ts
  export type ImageHostId = "default" | "github" | "aliyun" | "tencent-cos" | "cloudflare-r2";

  export interface UploadResult {
    url: string;
    pathname?: string;
  }

  export interface ImageHostEngine<Config = unknown> {
    id: ImageHostId;
    label: string;
    isConfigured: (config: Config | undefined) => boolean;
    upload: (file: File, config: Config) => Promise<UploadResult>;
  }

  export interface GithubConfig {
    repo: string;
    branch: string;
    accessToken: string;
    useCDN: boolean;
  }

  export interface AliyunConfig {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    customDomain?: string;
  }

  export interface TencentCosConfig {
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    customDomain?: string;
  }

  export interface CloudflareR2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicDomain: string;
  }

  export interface ImageHostConfigs {
    default?: Record<string, never>;
    github?: GithubConfig;
    aliyun?: AliyunConfig;
    "tencent-cos"?: TencentCosConfig;
    "cloudflare-r2"?: CloudflareR2Config;
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/types.test.ts`
  Expected: `2 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/types.ts frontend/src/lib/image-hosts/__tests__/types.test.ts && git commit -m "Plan B Task 1: add ImageHostEngine shared types"`

### Task 2: Object-key helper

**Files:** `frontend/src/lib/image-hosts/filename.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/filename.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { buildObjectKey } from "../filename";

  describe("buildObjectKey", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("generates YYYY/MM/<uuid>.<ext>", () => {
      const file = new File(["x"], "photo.PNG", { type: "image/png" });
      const key = buildObjectKey(file);
      expect(key).toMatch(/^2026\/04\/[0-9a-f-]{36}\.png$/);
    });

    it("falls back to bin extension when no filename extension is available", () => {
      const file = new File(["x"], "noext", { type: "application/octet-stream" });
      expect(buildObjectKey(file)).toMatch(/\.bin$/);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/filename.test.ts`
  Expected: `Cannot find module '../filename'`.
- [ ] Step 3: Implement minimal code
  Install uuid dep first: `cd frontend && npm install uuid && npm install -D @types/uuid`.
  Create `frontend/src/lib/image-hosts/filename.ts`:
  ```ts
  import { v4 as uuidv4 } from "uuid";

  export function buildObjectKey(file: File): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "bin";
    return `${yyyy}/${mm}/${uuidv4()}.${ext}`;
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/filename.test.ts`
  Expected: `2 passed`.
- [ ] Step 5: Commit
  `git add frontend/package.json frontend/package-lock.json frontend/src/lib/image-hosts/filename.ts frontend/src/lib/image-hosts/__tests__/filename.test.ts && git commit -m "Plan B Task 2: add buildObjectKey helper"`

### Task 3: Registry scaffolding

**Files:** `frontend/src/lib/image-hosts/registry.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/registry.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { getEngine, listEngines } from "../registry";

  describe("image-host registry", () => {
    it("lists all 5 engines with stable order", () => {
      const ids = listEngines().map((e) => e.id);
      expect(ids).toEqual(["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"]);
    });

    it("resolves engine by id", () => {
      const eng = getEngine("github");
      expect(eng.label).toBe("GitHub");
    });

    it("throws for unknown id", () => {
      // @ts-expect-error testing runtime guard
      expect(() => getEngine("bogus")).toThrow(/unknown image host/i);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/registry.test.ts`
  Expected: module not found.
- [ ] Step 3: Implement minimal code
  Create five stub engine files first (they will be filled in later stages). `frontend/src/lib/image-hosts/default.ts`:
  ```ts
  import type { ImageHostEngine } from "./types";
  export const defaultEngine: ImageHostEngine<Record<string, never>> = {
    id: "default",
    label: "公众号素材库",
    isConfigured: () => true,
    upload: async () => { throw new Error("not implemented"); },
  };
  ```
  Create `frontend/src/lib/image-hosts/github.ts`, `aliyun.ts`, `tencent-cos.ts`, `cloudflare-r2.ts` with matching stubs (labels: `GitHub`, `阿里云 OSS`, `腾讯云 COS`, `Cloudflare R2`; isConfigured returns `false`; upload throws `not implemented`).
  Create `frontend/src/lib/image-hosts/registry.ts`:
  ```ts
  import type { ImageHostEngine, ImageHostId } from "./types";
  import { defaultEngine } from "./default";
  import { githubEngine } from "./github";
  import { aliyunEngine } from "./aliyun";
  import { tencentCosEngine } from "./tencent-cos";
  import { cloudflareR2Engine } from "./cloudflare-r2";

  const ENGINES: Record<ImageHostId, ImageHostEngine<any>> = {
    default: defaultEngine,
    github: githubEngine,
    aliyun: aliyunEngine,
    "tencent-cos": tencentCosEngine,
    "cloudflare-r2": cloudflareR2Engine,
  };

  const ORDER: ImageHostId[] = ["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"];

  export function listEngines(): ImageHostEngine<any>[] {
    return ORDER.map((id) => ENGINES[id]);
  }

  export function getEngine(id: ImageHostId): ImageHostEngine<any> {
    const engine = ENGINES[id];
    if (!engine) throw new Error(`unknown image host: ${id}`);
    return engine;
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/registry.test.ts`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/ && git commit -m "Plan B Task 3: add engine registry with 5 stubs"`

### Task 4: Zustand store `imageHostStore`

**Files:** `frontend/src/stores/imageHostStore.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/stores/__tests__/imageHostStore.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from "vitest";
  import { useImageHostStore } from "@/stores/imageHostStore";

  describe("imageHostStore", () => {
    beforeEach(() => {
      window.localStorage.clear();
      useImageHostStore.persist.clearStorage();
      useImageHostStore.setState({ activeHostId: "default", configs: {} });
    });

    it("defaults to 'default' engine with empty configs", () => {
      const s = useImageHostStore.getState();
      expect(s.activeHostId).toBe("default");
      expect(s.configs).toEqual({});
    });

    it("setConfig stores per-engine config", () => {
      useImageHostStore.getState().setConfig("github", {
        repo: "me/img", branch: "main", accessToken: "t", useCDN: false,
      });
      expect(useImageHostStore.getState().configs.github?.repo).toBe("me/img");
    });

    it("setActiveHost switches active engine", () => {
      useImageHostStore.getState().setActiveHost("aliyun");
      expect(useImageHostStore.getState().activeHostId).toBe("aliyun");
    });

    it("persists to mbeditor.imagehost key", () => {
      useImageHostStore.getState().setActiveHost("github");
      useImageHostStore.getState().setConfig("github", {
        repo: "me/img", branch: "main", accessToken: "tok", useCDN: true,
      });
      const raw = window.localStorage.getItem("mbeditor.imagehost");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state.activeHostId).toBe("github");
      expect(parsed.state.configs.github.accessToken).toBe("tok");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/stores/__tests__/imageHostStore.test.ts`
  Expected: module not found.
- [ ] Step 3: Implement minimal code
  Create `frontend/src/stores/imageHostStore.ts`:
  ```ts
  import { create } from "zustand";
  import { persist } from "zustand/middleware";
  import type { ImageHostConfigs, ImageHostId } from "@/lib/image-hosts/types";

  interface ImageHostState {
    activeHostId: ImageHostId;
    configs: ImageHostConfigs;
    setActiveHost: (id: ImageHostId) => void;
    setConfig: <K extends keyof ImageHostConfigs>(id: K, cfg: ImageHostConfigs[K]) => void;
    clearConfig: (id: ImageHostId) => void;
  }

  export const useImageHostStore = create<ImageHostState>()(
    persist(
      (set) => ({
        activeHostId: "default",
        configs: {},
        setActiveHost: (activeHostId) => set({ activeHostId }),
        setConfig: (id, cfg) =>
          set((state) => ({ configs: { ...state.configs, [id]: cfg } })),
        clearConfig: (id) =>
          set((state) => {
            const next = { ...state.configs };
            delete next[id];
            return { configs: next };
          }),
      }),
      {
        name: "mbeditor.imagehost",
        partialize: (state) => ({
          activeHostId: state.activeHostId,
          configs: state.configs,
        }),
      }
    )
  );
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/stores/__tests__/imageHostStore.test.ts`
  Expected: `4 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/stores/imageHostStore.ts frontend/src/stores/__tests__/imageHostStore.test.ts && git commit -m "Plan B Task 4: add imageHostStore with persist"`

### Task 5: `getActiveEngine` + `uploadWithActive` helpers

**Files:** `frontend/src/lib/image-hosts/dispatch.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/dispatch.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, vi } from "vitest";
  import { uploadWithActive, getActiveEngine } from "../dispatch";
  import { useImageHostStore } from "@/stores/imageHostStore";

  describe("dispatch", () => {
    beforeEach(() => {
      window.localStorage.clear();
      useImageHostStore.setState({ activeHostId: "default", configs: {} });
    });

    it("returns active engine", () => {
      useImageHostStore.setState({ activeHostId: "github" });
      expect(getActiveEngine().id).toBe("github");
    });

    it("throws when active engine is not configured", async () => {
      useImageHostStore.setState({ activeHostId: "github", configs: {} });
      const file = new File(["x"], "x.png", { type: "image/png" });
      await expect(uploadWithActive(file)).rejects.toThrow(/未配置/);
    });

    it("calls engine.upload with active config when configured", async () => {
      useImageHostStore.setState({
        activeHostId: "github",
        configs: { github: { repo: "me/img", branch: "main", accessToken: "t", useCDN: false } },
      });
      const fakeUpload = vi.fn().mockResolvedValue({ url: "https://cdn/x.png" });
      const mod = await import("../github");
      vi.spyOn(mod.githubEngine, "upload").mockImplementation(fakeUpload);
      const file = new File(["x"], "x.png", { type: "image/png" });
      const res = await uploadWithActive(file);
      expect(fakeUpload).toHaveBeenCalled();
      expect(res.url).toBe("https://cdn/x.png");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/dispatch.test.ts`
  Expected: module not found.
- [ ] Step 3: Implement minimal code
  Create `frontend/src/lib/image-hosts/dispatch.ts`:
  ```ts
  import { useImageHostStore } from "@/stores/imageHostStore";
  import { getEngine } from "./registry";
  import type { ImageHostEngine, UploadResult } from "./types";

  export function getActiveEngine(): ImageHostEngine<any> {
    const { activeHostId } = useImageHostStore.getState();
    return getEngine(activeHostId);
  }

  export async function uploadWithActive(file: File): Promise<UploadResult> {
    const engine = getActiveEngine();
    const config = useImageHostStore.getState().configs[engine.id];
    if (!engine.isConfigured(config as any)) {
      throw new Error(`图床未配置: ${engine.label}`);
    }
    return engine.upload(file, config);
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/dispatch.test.ts`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/dispatch.ts frontend/src/lib/image-hosts/__tests__/dispatch.test.ts && git commit -m "Plan B Task 5: add getActiveEngine + uploadWithActive"`

---

## Stage 2: Default engine (WeChat proxy)

### Task 6: Default engine uploads via `/api/v1/wechat/upload-image`

**Files:** `frontend/src/lib/image-hosts/default.ts`, `frontend/src/lib/image-hosts/__tests__/default.test.ts`

- [ ] Step 1: Write the failing test
  ```ts
  // frontend/src/lib/image-hosts/__tests__/default.test.ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

  const postMock = vi.fn();
  vi.mock("@/lib/api", () => ({ default: { post: (...a: unknown[]) => postMock(...a) } }));

  describe("default (WeChat) engine", () => {
    afterEach(() => vi.clearAllMocks());
    beforeEach(() => {
      postMock.mockResolvedValue({ data: { code: 0, data: { url: "https://mmbiz.qpic.cn/x.png" } } });
    });

    it("isConfigured always true (server-side auth)", async () => {
      const { defaultEngine } = await import("../default");
      expect(defaultEngine.isConfigured({})).toBe(true);
    });

    it("POSTs multipart to /wechat/upload-image and returns url", async () => {
      const { defaultEngine } = await import("../default");
      const file = new File(["x"], "a.png", { type: "image/png" });
      const res = await defaultEngine.upload(file, {});
      expect(postMock).toHaveBeenCalledWith(
        "/wechat/upload-image",
        expect.any(FormData),
        expect.objectContaining({ headers: { "Content-Type": "multipart/form-data" } })
      );
      expect(res.url).toBe("https://mmbiz.qpic.cn/x.png");
    });

    it("throws when envelope code !== 0", async () => {
      postMock.mockResolvedValueOnce({ data: { code: 40001, message: "invalid token" } });
      const { defaultEngine } = await import("../default");
      const file = new File(["x"], "a.png", { type: "image/png" });
      await expect(defaultEngine.upload(file, {})).rejects.toThrow(/invalid token/);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/default.test.ts`
  Expected: third test fails (stub still throws "not implemented").
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/default.ts`:
  ```ts
  import api from "@/lib/api";
  import type { ImageHostEngine, UploadResult } from "./types";

  export const defaultEngine: ImageHostEngine<Record<string, never>> = {
    id: "default",
    label: "公众号素材库",
    isConfigured: () => true,
    async upload(file: File): Promise<UploadResult> {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await api.post("/wechat/upload-image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const body = res.data as { code?: number; message?: string; data?: { url: string } };
      if (typeof body.code === "number" && body.code !== 0) {
        throw new Error(body.message || "上传失败");
      }
      const url = body.data?.url;
      if (!url) throw new Error("上传失败：无返回地址");
      return { url };
    },
  };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/default.test.ts`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/default.ts frontend/src/lib/image-hosts/__tests__/default.test.ts && git commit -m "Plan B Task 6: implement default (WeChat proxy) engine"`

---

## Stage 3: GitHub engine

### Task 7: GitHub engine — isConfigured

**Files:** `frontend/src/lib/image-hosts/github.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/github.test.ts` (isConfigured cases only):
  ```ts
  import { describe, it, expect } from "vitest";
  import { githubEngine } from "../github";

  describe("githubEngine.isConfigured", () => {
    it("false when token missing", () => {
      expect(githubEngine.isConfigured({ repo: "r", branch: "main", accessToken: "", useCDN: false })).toBe(false);
    });
    it("false when repo missing", () => {
      expect(githubEngine.isConfigured({ repo: "", branch: "main", accessToken: "t", useCDN: false })).toBe(false);
    });
    it("true when all required present", () => {
      expect(githubEngine.isConfigured({ repo: "me/img", branch: "main", accessToken: "t", useCDN: false })).toBe(true);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/github.test.ts`
  Expected: stub `isConfigured` returns false for the last case.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/github.ts`:
  ```ts
  import type { GithubConfig, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const githubEngine: ImageHostEngine<GithubConfig> = {
    id: "github",
    label: "GitHub",
    isConfigured: (c) => Boolean(c && c.repo && c.branch && c.accessToken),
    upload: async (_file, _config) => { throw new Error("not implemented"); },
  };
  export { buildObjectKey };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/github.test.ts`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/github.ts frontend/src/lib/image-hosts/__tests__/github.test.ts && git commit -m "Plan B Task 7: GitHub engine isConfigured guard"`

### Task 8: GitHub engine — PUT contents API

**Files:** `frontend/src/lib/image-hosts/github.ts`

- [ ] Step 1: Write the failing test — append to `github.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { githubEngine } from "../github";

  describe("githubEngine.upload", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      fetchMock.mockReset();
    });

    it("PUTs to contents API with base64 body and Bearer token", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: { download_url: "https://raw.githubusercontent.com/me/img/main/2026/04/x.png", path: "2026/04/x.png" },
        }),
      });
      const file = new File(["abc"], "x.png", { type: "image/png" });
      const res = await githubEngine.upload(file, {
        repo: "me/img", branch: "main", accessToken: "ghp_xxx", useCDN: false,
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/^https:\/\/api\.github\.com\/repos\/me\/img\/contents\/2026\/04\/[0-9a-f-]+\.png$/);
      expect(init.method).toBe("PUT");
      expect(init.headers.Authorization).toBe("Bearer ghp_xxx");
      expect(init.headers.Accept).toBe("application/vnd.github+json");
      const body = JSON.parse(init.body);
      expect(body.branch).toBe("main");
      expect(body.message).toMatch(/upload/i);
      expect(body.content).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(res.url).toBe("https://raw.githubusercontent.com/me/img/main/2026/04/x.png");
    });

    it("rewrites to jsDelivr CDN when useCDN=true", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ content: { download_url: "https://raw.githubusercontent.com/me/img/main/2026/04/x.png", path: "2026/04/x.png" } }),
      });
      const file = new File(["abc"], "x.png", { type: "image/png" });
      const res = await githubEngine.upload(file, {
        repo: "me/img", branch: "main", accessToken: "t", useCDN: true,
      });
      expect(res.url).toBe("https://cdn.jsdelivr.net/gh/me/img@main/2026/04/x.png");
    });

    it("throws with GitHub error message on non-ok", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Bad credentials" }) });
      const file = new File(["abc"], "x.png", { type: "image/png" });
      await expect(
        githubEngine.upload(file, { repo: "me/img", branch: "main", accessToken: "t", useCDN: false })
      ).rejects.toThrow(/Bad credentials/);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/github.test.ts`
  Expected: fails with `not implemented`.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/github.ts`:
  ```ts
  import type { GithubConfig, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  export const githubEngine: ImageHostEngine<GithubConfig> = {
    id: "github",
    label: "GitHub",
    isConfigured: (c) => Boolean(c && c.repo && c.branch && c.accessToken),
    async upload(file: File, config: GithubConfig): Promise<UploadResult> {
      const path = buildObjectKey(file);
      const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
      const body = {
        message: `upload ${path}`,
        branch: config.branch,
        content: await fileToBase64(file),
      };
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || `GitHub upload failed (${res.status})`);
      }
      const json = (await res.json()) as { content?: { download_url?: string; path?: string } };
      const downloadUrl = json.content?.download_url;
      if (!downloadUrl) throw new Error("GitHub response missing download_url");
      const finalUrl = config.useCDN
        ? `https://cdn.jsdelivr.net/gh/${config.repo}@${config.branch}/${path}`
        : downloadUrl;
      return { url: finalUrl, pathname: path };
    },
  };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/github.test.ts`
  Expected: `6 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/github.ts frontend/src/lib/image-hosts/__tests__/github.test.ts && git commit -m "Plan B Task 8: GitHub engine PUT contents API"`

---

## Stage 4: Aliyun OSS engine

### Task 9: Install ali-oss dependency

**Files:** `frontend/package.json`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/aliyun.dep.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  describe("ali-oss dep", () => {
    it("is installed", async () => {
      const mod = await import("ali-oss");
      expect(mod.default).toBeTypeOf("function");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.dep.test.ts`
  Expected: `Cannot find package 'ali-oss'`.
- [ ] Step 3: Implement minimal code
  `cd frontend && npm install ali-oss && npm install -D @types/ali-oss`
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.dep.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/package.json frontend/package-lock.json frontend/src/lib/image-hosts/__tests__/aliyun.dep.test.ts && git commit -m "Plan B Task 9: install ali-oss dep"`

### Task 10: Aliyun engine — isConfigured

**Files:** `frontend/src/lib/image-hosts/aliyun.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/aliyun.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { aliyunEngine } from "../aliyun";

  describe("aliyunEngine.isConfigured", () => {
    it("requires all fields", () => {
      expect(aliyunEngine.isConfigured(undefined)).toBe(false);
      expect(aliyunEngine.isConfigured({
        accessKeyId: "", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
      })).toBe(false);
      expect(aliyunEngine.isConfigured({
        accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
      })).toBe(true);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.test.ts`
  Expected: third assertion fails (stub returns false).
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/aliyun.ts`:
  ```ts
  import type { AliyunConfig, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const aliyunEngine: ImageHostEngine<AliyunConfig> = {
    id: "aliyun",
    label: "阿里云 OSS",
    isConfigured: (c) => Boolean(c && c.accessKeyId && c.accessKeySecret && c.bucket && c.region),
    upload: async (_f, _c): Promise<UploadResult> => { throw new Error("not implemented"); },
  };
  export { buildObjectKey };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/aliyun.ts frontend/src/lib/image-hosts/__tests__/aliyun.test.ts && git commit -m "Plan B Task 10: Aliyun engine isConfigured"`

### Task 11: Aliyun engine — upload via ali-oss

**Files:** `frontend/src/lib/image-hosts/aliyun.ts`

- [ ] Step 1: Write the failing test — append to `aliyun.test.ts`:
  ```ts
  import { vi, beforeEach, afterEach } from "vitest";

  const putMock = vi.fn();
  vi.mock("ali-oss", () => ({
    default: vi.fn().mockImplementation(() => ({ put: (...a: unknown[]) => putMock(...a) })),
  }));

  describe("aliyunEngine.upload", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
      putMock.mockResolvedValue({ url: "https://b.oss-cn-hangzhou.aliyuncs.com/2026/04/x.png", name: "2026/04/x.png" });
    });
    afterEach(() => { vi.useRealTimers(); putMock.mockReset(); });

    it("calls client.put(key, file) and returns url", async () => {
      const { aliyunEngine } = await import("../aliyun");
      const file = new File(["x"], "x.png", { type: "image/png" });
      const res = await aliyunEngine.upload(file, {
        accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
      });
      const [key, arg] = putMock.mock.calls[0];
      expect(key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
      expect(arg).toBe(file);
      expect(res.url).toBe("https://b.oss-cn-hangzhou.aliyuncs.com/2026/04/x.png");
    });

    it("prefers customDomain when provided", async () => {
      const { aliyunEngine } = await import("../aliyun");
      const file = new File(["x"], "x.png", { type: "image/png" });
      const res = await aliyunEngine.upload(file, {
        accessKeyId: "k", accessKeySecret: "s", bucket: "b", region: "oss-cn-hangzhou",
        customDomain: "https://cdn.example.com",
      });
      expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.test.ts`
  Expected: `not implemented`.
- [ ] Step 3: Implement minimal code
  Replace upload in `frontend/src/lib/image-hosts/aliyun.ts`:
  ```ts
  import OSS from "ali-oss";
  import type { AliyunConfig, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const aliyunEngine: ImageHostEngine<AliyunConfig> = {
    id: "aliyun",
    label: "阿里云 OSS",
    isConfigured: (c) => Boolean(c && c.accessKeyId && c.accessKeySecret && c.bucket && c.region),
    async upload(file: File, config: AliyunConfig): Promise<UploadResult> {
      const key = buildObjectKey(file);
      const client = new OSS({
        region: config.region,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        secure: true,
      });
      const res = await client.put(key, file);
      const resolvedUrl = config.customDomain
        ? `${config.customDomain.replace(/\/+$/, "")}/${key}`
        : (res as { url: string }).url;
      return { url: resolvedUrl, pathname: key };
    },
  };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/aliyun.test.ts`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/aliyun.ts frontend/src/lib/image-hosts/__tests__/aliyun.test.ts && git commit -m "Plan B Task 11: Aliyun OSS upload via ali-oss"`

---

## Stage 5: Tencent COS engine

### Task 12: Install cos-js-sdk-v5

**Files:** `frontend/package.json`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/tencent-cos.dep.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  describe("cos-js-sdk-v5 dep", () => {
    it("is installed", async () => {
      const mod = await import("cos-js-sdk-v5");
      expect(mod.default).toBeTypeOf("function");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.dep.test.ts`
  Expected: Cannot find package.
- [ ] Step 3: Implement minimal code
  `cd frontend && npm install cos-js-sdk-v5`
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.dep.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/package.json frontend/package-lock.json frontend/src/lib/image-hosts/__tests__/tencent-cos.dep.test.ts && git commit -m "Plan B Task 12: install cos-js-sdk-v5 dep"`

### Task 13: Tencent COS engine — isConfigured

**Files:** `frontend/src/lib/image-hosts/tencent-cos.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/tencent-cos.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { tencentCosEngine } from "../tencent-cos";

  describe("tencentCosEngine.isConfigured", () => {
    it("requires all fields", () => {
      expect(tencentCosEngine.isConfigured(undefined)).toBe(false);
      expect(tencentCosEngine.isConfigured({
        secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
      })).toBe(true);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.test.ts`
  Expected: second assertion fails.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/tencent-cos.ts`:
  ```ts
  import type { ImageHostEngine, TencentCosConfig, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const tencentCosEngine: ImageHostEngine<TencentCosConfig> = {
    id: "tencent-cos",
    label: "腾讯云 COS",
    isConfigured: (c) => Boolean(c && c.secretId && c.secretKey && c.bucket && c.region),
    async upload(_f, _c): Promise<UploadResult> { throw new Error("not implemented"); },
  };
  export { buildObjectKey };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/tencent-cos.ts frontend/src/lib/image-hosts/__tests__/tencent-cos.test.ts && git commit -m "Plan B Task 13: Tencent COS isConfigured"`

### Task 14: Tencent COS engine — upload via SDK

**Files:** `frontend/src/lib/image-hosts/tencent-cos.ts`

- [ ] Step 1: Write the failing test — append to `tencent-cos.test.ts`:
  ```ts
  import { vi, beforeEach, afterEach } from "vitest";

  const putObjectMock = vi.fn();
  vi.mock("cos-js-sdk-v5", () => ({
    default: vi.fn().mockImplementation(() => ({ putObject: (...a: unknown[]) => putObjectMock(...a) })),
  }));

  describe("tencentCosEngine.upload", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
      putObjectMock.mockImplementation((_params, cb) => {
        cb(null, { Location: "b-1234.cos.ap-guangzhou.myqcloud.com/2026/04/x.png" });
      });
    });
    afterEach(() => { vi.useRealTimers(); putObjectMock.mockReset(); });

    it("calls putObject with Bucket/Region/Key and https Location", async () => {
      const { tencentCosEngine } = await import("../tencent-cos");
      const file = new File(["x"], "x.png", { type: "image/png" });
      const res = await tencentCosEngine.upload(file, {
        secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
      });
      const [params] = putObjectMock.mock.calls[0];
      expect(params.Bucket).toBe("b-1234");
      expect(params.Region).toBe("ap-guangzhou");
      expect(params.Key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
      expect(params.Body).toBe(file);
      expect(res.url).toBe("https://b-1234.cos.ap-guangzhou.myqcloud.com/2026/04/x.png");
    });

    it("prefers customDomain", async () => {
      const { tencentCosEngine } = await import("../tencent-cos");
      const file = new File(["x"], "x.png", { type: "image/png" });
      const res = await tencentCosEngine.upload(file, {
        secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
        customDomain: "https://cdn.example.com",
      });
      expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
    });

    it("rejects on SDK error", async () => {
      putObjectMock.mockImplementationOnce((_p, cb) => cb(new Error("denied"), null));
      const { tencentCosEngine } = await import("../tencent-cos");
      const file = new File(["x"], "x.png", { type: "image/png" });
      await expect(tencentCosEngine.upload(file, {
        secretId: "i", secretKey: "k", bucket: "b-1234", region: "ap-guangzhou",
      })).rejects.toThrow(/denied/);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.test.ts`
  Expected: `not implemented`.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/tencent-cos.ts`:
  ```ts
  import COS from "cos-js-sdk-v5";
  import type { ImageHostEngine, TencentCosConfig, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const tencentCosEngine: ImageHostEngine<TencentCosConfig> = {
    id: "tencent-cos",
    label: "腾讯云 COS",
    isConfigured: (c) => Boolean(c && c.secretId && c.secretKey && c.bucket && c.region),
    async upload(file: File, config: TencentCosConfig): Promise<UploadResult> {
      const key = buildObjectKey(file);
      const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
      const location = await new Promise<string>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: config.bucket,
            Region: config.region,
            Key: key,
            Body: file,
          },
          (err, data) => {
            if (err) return reject(err);
            resolve(data.Location);
          }
        );
      });
      const url = config.customDomain
        ? `${config.customDomain.replace(/\/+$/, "")}/${key}`
        : `https://${location}`;
      return { url, pathname: key };
    },
  };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/tencent-cos.test.ts`
  Expected: `4 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/tencent-cos.ts frontend/src/lib/image-hosts/__tests__/tencent-cos.test.ts && git commit -m "Plan B Task 14: Tencent COS upload via SDK"`

---

## Stage 6: Cloudflare R2 engine

### Task 15: Install @aws-sdk/client-s3

**Files:** `frontend/package.json`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/r2.dep.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  describe("@aws-sdk/client-s3 dep", () => {
    it("exports S3Client + PutObjectCommand", async () => {
      const mod = await import("@aws-sdk/client-s3");
      expect(mod.S3Client).toBeTypeOf("function");
      expect(mod.PutObjectCommand).toBeTypeOf("function");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/r2.dep.test.ts`
  Expected: Cannot find package.
- [ ] Step 3: Implement minimal code
  `cd frontend && npm install @aws-sdk/client-s3`
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/r2.dep.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/package.json frontend/package-lock.json frontend/src/lib/image-hosts/__tests__/r2.dep.test.ts && git commit -m "Plan B Task 15: install @aws-sdk/client-s3 dep"`

### Task 16: R2 engine — isConfigured

**Files:** `frontend/src/lib/image-hosts/cloudflare-r2.ts`

- [ ] Step 1: Write the failing test
  Create `frontend/src/lib/image-hosts/__tests__/cloudflare-r2.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { cloudflareR2Engine } from "../cloudflare-r2";

  describe("cloudflareR2Engine.isConfigured", () => {
    it("requires all five fields", () => {
      expect(cloudflareR2Engine.isConfigured(undefined)).toBe(false);
      expect(cloudflareR2Engine.isConfigured({
        accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b", publicDomain: "https://cdn.x",
      })).toBe(true);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/cloudflare-r2.test.ts`
  Expected: second assertion fails.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/cloudflare-r2.ts`:
  ```ts
  import type { CloudflareR2Config, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const cloudflareR2Engine: ImageHostEngine<CloudflareR2Config> = {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    isConfigured: (c) =>
      Boolean(c && c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicDomain),
    async upload(_f, _c): Promise<UploadResult> { throw new Error("not implemented"); },
  };
  export { buildObjectKey };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/cloudflare-r2.test.ts`
  Expected: `1 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/cloudflare-r2.ts frontend/src/lib/image-hosts/__tests__/cloudflare-r2.test.ts && git commit -m "Plan B Task 16: R2 engine isConfigured"`

### Task 17: R2 engine — upload via S3Client

**Files:** `frontend/src/lib/image-hosts/cloudflare-r2.ts`

- [ ] Step 1: Write the failing test — append to `cloudflare-r2.test.ts`:
  ```ts
  import { vi, beforeEach, afterEach } from "vitest";

  const sendMock = vi.fn();
  vi.mock("@aws-sdk/client-s3", () => ({
    S3Client: vi.fn().mockImplementation((opts) => ({ __opts: opts, send: (...a: unknown[]) => sendMock(...a) })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ __input: input })),
  }));

  describe("cloudflareR2Engine.upload", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-21T10:00:00Z"));
      sendMock.mockResolvedValue({});
    });
    afterEach(() => { vi.useRealTimers(); sendMock.mockReset(); });

    it("configures S3Client with R2 endpoint and sends PutObjectCommand", async () => {
      const s3 = await import("@aws-sdk/client-s3");
      const { cloudflareR2Engine } = await import("../cloudflare-r2");
      const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
      const res = await cloudflareR2Engine.upload(file, {
        accountId: "acc", accessKeyId: "k", secretAccessKey: "s", bucket: "b",
        publicDomain: "https://cdn.example.com",
      });
      const s3Opts = (s3.S3Client as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as any;
      expect(s3Opts.region).toBe("auto");
      expect(s3Opts.endpoint).toBe("https://acc.r2.cloudflarestorage.com");
      expect(s3Opts.credentials.accessKeyId).toBe("k");
      const cmdInput = (s3.PutObjectCommand as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as any;
      expect(cmdInput.Bucket).toBe("b");
      expect(cmdInput.Key).toMatch(/^2026\/04\/[0-9a-f-]+\.png$/);
      expect(cmdInput.ContentType).toBe("image/png");
      expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/2026\/04\//);
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/cloudflare-r2.test.ts`
  Expected: `not implemented`.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/lib/image-hosts/cloudflare-r2.ts`:
  ```ts
  import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
  import type { CloudflareR2Config, ImageHostEngine, UploadResult } from "./types";
  import { buildObjectKey } from "./filename";

  export const cloudflareR2Engine: ImageHostEngine<CloudflareR2Config> = {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    isConfigured: (c) =>
      Boolean(c && c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.publicDomain),
    async upload(file: File, config: CloudflareR2Config): Promise<UploadResult> {
      const key = buildObjectKey(file);
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      const body = new Uint8Array(await file.arrayBuffer());
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: file.type || "application/octet-stream",
        })
      );
      const url = `${config.publicDomain.replace(/\/+$/, "")}/${key}`;
      return { url, pathname: key };
    },
  };
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/lib/image-hosts/__tests__/cloudflare-r2.test.ts`
  Expected: `2 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/lib/image-hosts/cloudflare-r2.ts frontend/src/lib/image-hosts/__tests__/cloudflare-r2.test.ts && git commit -m "Plan B Task 17: Cloudflare R2 upload via S3Client"`

---

## Stage 7: Settings UI

### Task 18: Settings — add 图床 nav entry

**Files:** `frontend/src/surfaces/settings/SettingsSurface.tsx`, `frontend/src/surfaces/settings/SettingsSurface.test.tsx`

- [ ] Step 1: Write the failing test — append to `SettingsSurface.test.tsx`:
  ```ts
  it("renders 图床 nav entry and placeholder section", async () => {
    render(<SettingsSurface go={vi.fn()} />);
    const navBtn = screen.getByRole("button", { name: "图床" });
    fireEvent.click(navBtn);
    await waitFor(() => {
      expect(screen.getByTestId("imagehost-section")).toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/SettingsSurface.test.tsx`
  Expected: no button with name 图床.
- [ ] Step 3: Implement minimal code
  In `SettingsSurface.tsx`:
  1. Change `type Section = "wechat" | "appearance" | "editor" | "about";` to include `"imagehost"`.
  2. Add `{ key: "imagehost", label: "图床" }` to `NAV_ITEMS` (insert between wechat and appearance).
  3. Add new import: `import ImageHostsSection from "./ImageHostsSection";`.
  4. Render `{section === "imagehost" && <ImageHostsSection />}` alongside other section renders.
  Create placeholder `frontend/src/surfaces/settings/ImageHostsSection.tsx`:
  ```tsx
  export default function ImageHostsSection() {
    return <div data-testid="imagehost-section">图床</div>;
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/SettingsSurface.test.tsx`
  Expected: all tests pass including the new one.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ && git commit -m "Plan B Task 18: add 图床 settings nav entry"`

### Task 19: Engine picker

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`, `frontend/src/surfaces/settings/ImageHostsSection.test.tsx`

- [ ] Step 1: Write the failing test
  Create `frontend/src/surfaces/settings/ImageHostsSection.test.tsx`:
  ```tsx
  import "@testing-library/jest-dom/vitest";
  import { cleanup, fireEvent, render, screen } from "@testing-library/react";
  import { afterEach, beforeEach, describe, expect, it } from "vitest";
  import ImageHostsSection from "./ImageHostsSection";
  import { useImageHostStore } from "@/stores/imageHostStore";

  describe("ImageHostsSection picker", () => {
    afterEach(cleanup);
    beforeEach(() => {
      window.localStorage.clear();
      useImageHostStore.setState({ activeHostId: "default", configs: {} });
    });

    it("renders 5 engine options and marks active", () => {
      render(<ImageHostsSection />);
      ["公众号素材库", "GitHub", "阿里云 OSS", "腾讯云 COS", "Cloudflare R2"].forEach((label) => {
        expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
      });
      expect(screen.getByRole("radio", { name: "公众号素材库" })).toBeChecked();
    });

    it("switches active engine on click", () => {
      render(<ImageHostsSection />);
      fireEvent.click(screen.getByRole("radio", { name: "GitHub" }));
      expect(useImageHostStore.getState().activeHostId).toBe("github");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: no radios.
- [ ] Step 3: Implement minimal code
  Replace `frontend/src/surfaces/settings/ImageHostsSection.tsx`:
  ```tsx
  import { listEngines } from "@/lib/image-hosts/registry";
  import { useImageHostStore } from "@/stores/imageHostStore";
  import type { ImageHostId } from "@/lib/image-hosts/types";

  export default function ImageHostsSection() {
    const activeHostId = useImageHostStore((s) => s.activeHostId);
    const setActiveHost = useImageHostStore((s) => s.setActiveHost);

    return (
      <div data-testid="imagehost-section" style={{ maxWidth: 560 }}>
        <div className="caps" style={{ fontSize: 10, letterSpacing: "0.15em", color: "var(--gold)", marginBottom: 8 }}>
          图床
        </div>
        <div style={{ height: 1, background: "var(--border)", marginBottom: 24 }} />

        <div role="radiogroup" aria-label="图床引擎" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          {listEngines().map((engine) => {
            const checked = activeHostId === engine.id;
            return (
              <label
                key={engine.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px",
                  border: checked ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "var(--r-md)", cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="imagehost-engine"
                  value={engine.id}
                  checked={checked}
                  onChange={() => setActiveHost(engine.id as ImageHostId)}
                  aria-label={engine.label}
                />
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{engine.label}</span>
              </label>
            );
          })}
        </div>

        <div data-testid="imagehost-config-form" />
      </div>
    );
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: `2 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 19: engine picker radios"`

### Task 20: GitHub config form

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append to `ImageHostsSection.test.tsx`:
  ```ts
  it("shows GitHub config fields when GitHub active, persists on blur", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "GitHub" }));
    const repo = screen.getByLabelText("仓库");
    fireEvent.change(repo, { target: { value: "me/img" } });
    fireEvent.blur(repo);
    expect(useImageHostStore.getState().configs.github?.repo).toBe("me/img");
    expect(screen.getByLabelText("分支")).toBeInTheDocument();
    expect(screen.getByLabelText("Access Token")).toHaveAttribute("type", "password");
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: form fields absent.
- [ ] Step 3: Implement minimal code
  Add a `GithubForm` sub-component inside `ImageHostsSection.tsx` and render when `activeHostId === "github"`:
  ```tsx
  function GithubForm() {
    const cfg = useImageHostStore((s) => s.configs.github);
    const setConfig = useImageHostStore((s) => s.setConfig);
    const draft = {
      repo: cfg?.repo ?? "",
      branch: cfg?.branch ?? "main",
      accessToken: cfg?.accessToken ?? "",
      useCDN: cfg?.useCDN ?? false,
    };
    function commit(patch: Partial<typeof draft>) {
      setConfig("github", { ...draft, ...patch });
    }
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <label>
          <div style={fieldLabelStyle}>仓库</div>
          <input aria-label="仓库" defaultValue={draft.repo} onBlur={(e) => commit({ repo: e.target.value })} placeholder="owner/repo" style={inputStyle} />
        </label>
        <label>
          <div style={fieldLabelStyle}>分支</div>
          <input aria-label="分支" defaultValue={draft.branch} onBlur={(e) => commit({ branch: e.target.value })} style={inputStyle} />
        </label>
        <label>
          <div style={fieldLabelStyle}>Access Token</div>
          <input aria-label="Access Token" type="password" defaultValue={draft.accessToken} onBlur={(e) => commit({ accessToken: e.target.value })} style={inputStyle} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input aria-label="使用 jsDelivr CDN" type="checkbox" defaultChecked={draft.useCDN} onChange={(e) => commit({ useCDN: e.target.checked })} />
          <span style={{ fontSize: 12 }}>通过 jsDelivr CDN 加速访问</span>
        </label>
      </div>
    );
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: "0.12em", color: "var(--fg-4)", marginBottom: 4, textTransform: "uppercase",
  };
  const inputStyle: React.CSSProperties = {
    display: "block", width: "100%", boxSizing: "border-box",
    fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--fg-2)",
    padding: "8px 0", borderBottom: "1px solid var(--border)", border: "none", background: "transparent",
  };
  ```
  Then inside the main component, beneath the picker:
  ```tsx
  <div data-testid="imagehost-config-form">
    {activeHostId === "github" && <GithubForm />}
  </div>
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: `3 passed`.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 20: GitHub config form"`

### Task 21: Aliyun config form

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  it("shows Aliyun form when selected, persists values", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "阿里云 OSS" }));
    fireEvent.blur(Object.assign(screen.getByLabelText("AccessKeyId"), {}), { target: { value: "k" } });
    const aki = screen.getByLabelText("AccessKeyId") as HTMLInputElement;
    fireEvent.change(aki, { target: { value: "k" } });
    fireEvent.blur(aki);
    expect(useImageHostStore.getState().configs.aliyun?.accessKeyId).toBe("k");
    expect(screen.getByLabelText("AccessKeySecret")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toBeInTheDocument();
    expect(screen.getByLabelText("自定义域名 (可选)")).toBeInTheDocument();
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: fields absent.
- [ ] Step 3: Implement minimal code
  Add `AliyunForm` component analogous to `GithubForm` — fields: AccessKeyId (text), AccessKeySecret (password), Bucket (text), Region (text, placeholder `oss-cn-hangzhou`), 自定义域名 (可选). Render when `activeHostId === "aliyun"`.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: new test passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 21: Aliyun OSS config form"`

### Task 22: Tencent COS config form

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  it("shows Tencent COS form when selected", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "腾讯云 COS" }));
    expect(screen.getByLabelText("SecretId")).toBeInTheDocument();
    expect(screen.getByLabelText("SecretKey")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
    expect(screen.getByLabelText("Region")).toBeInTheDocument();
    const sid = screen.getByLabelText("SecretId") as HTMLInputElement;
    fireEvent.change(sid, { target: { value: "i" } });
    fireEvent.blur(sid);
    expect(useImageHostStore.getState().configs["tencent-cos"]?.secretId).toBe("i");
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: fields absent.
- [ ] Step 3: Implement minimal code
  Add `TencentCosForm` analogous to previous forms. Fields: SecretId, SecretKey (password), Bucket (placeholder `my-bucket-1250000000`), Region (`ap-guangzhou`), 自定义域名 (可选). Render when `activeHostId === "tencent-cos"`.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 22: Tencent COS config form"`

### Task 23: R2 config form

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  it("shows R2 form when selected", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "Cloudflare R2" }));
    expect(screen.getByLabelText("Account ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Access Key ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Secret Access Key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
    expect(screen.getByLabelText("Public Domain")).toBeInTheDocument();
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: fields absent.
- [ ] Step 3: Implement minimal code
  Add `CloudflareR2Form` with fields Account ID, Access Key ID, Secret Access Key (password), Bucket, Public Domain. Render when `activeHostId === "cloudflare-r2"`.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 23: Cloudflare R2 config form"`

### Task 24: Default engine info panel

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  it("shows info copy when default engine active (no form)", () => {
    render(<ImageHostsSection />);
    expect(screen.getByTestId("imagehost-default-info")).toHaveTextContent(/公众号素材库/);
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: testid missing.
- [ ] Step 3: Implement minimal code
  Render when `activeHostId === "default"`:
  ```tsx
  <div data-testid="imagehost-default-info" style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6 }}>
    当前使用「公众号素材库」：图片会通过后端代理上传到当前激活的公众号 AppID 对应的素材库，并返回 mmbiz.qpic.cn 链接。
    如需自托管，请在上方切换到其他图床并填入凭据。
  </div>
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 24: default engine info panel"`

### Task 25: Test-upload button

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  import { vi } from "vitest";

  it("test-upload disabled until engine configured", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "GitHub" }));
    const btn = screen.getByRole("button", { name: /测试上传/ });
    expect(btn).toBeDisabled();
  });

  it("test-upload dispatches to engine.upload and shows result url", async () => {
    const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
    vi.spyOn({ uploadWithActive }, "uploadWithActive"); // keep TS happy
    // stub via store config + spy on github engine
    const gh = await import("@/lib/image-hosts/github");
    vi.spyOn(gh.githubEngine, "upload").mockResolvedValue({ url: "https://cdn/test.png" });

    useImageHostStore.setState({
      activeHostId: "github",
      configs: { github: { repo: "me/img", branch: "main", accessToken: "t", useCDN: false } },
    });
    render(<ImageHostsSection />);
    const btn = screen.getByRole("button", { name: /测试上传/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId("imagehost-test-result")).toHaveTextContent("https://cdn/test.png");
    });
  });
  ```
  (Ensure `import { waitFor } from "@testing-library/react";` is in scope.)
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: button missing.
- [ ] Step 3: Implement minimal code
  Add to `ImageHostsSection` below the form:
  ```tsx
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const activeConfig = useImageHostStore((s) => s.configs[s.activeHostId as keyof typeof s.configs]);
  const activeEngine = getEngine(activeHostId);
  const canTest = activeEngine.isConfigured(activeConfig as any);

  async function runTestUpload() {
    setTesting(true); setTestResult(null);
    try {
      // 1×1 transparent PNG
      const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
      const file = new File([png], "test.png", { type: "image/png" });
      const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
      const res = await uploadWithActive(file);
      setTestResult(res.url);
    } catch (err) {
      setTestResult(err instanceof Error ? `错误: ${err.message}` : "错误");
    } finally { setTesting(false); }
  }
  ```
  Render:
  ```tsx
  <div style={{ marginTop: 20 }}>
    <button className="btn btn-primary btn-sm" disabled={!canTest || testing} onClick={runTestUpload}>
      {testing ? "上传中..." : "测试上传"}
    </button>
    {testResult && <div data-testid="imagehost-test-result" style={{ marginTop: 12, fontFamily: "var(--f-mono)", fontSize: 12 }}>{testResult}</div>}
  </div>
  ```
  Add imports: `import { useState } from "react";` and `import { getEngine } from "@/lib/image-hosts/registry";`.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: all tests pass.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 25: test-upload button"`

### Task 26: Security note footer

**Files:** `frontend/src/surfaces/settings/ImageHostsSection.tsx`

- [ ] Step 1: Write the failing test — append:
  ```ts
  it("shows security note", () => {
    render(<ImageHostsSection />);
    expect(screen.getByTestId("imagehost-security-note"))
      .toHaveTextContent(/仅保存在当前浏览器/);
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: testid missing.
- [ ] Step 3: Implement minimal code
  At the bottom of the main component return:
  ```tsx
  <div data-testid="imagehost-security-note" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--fg-4)", lineHeight: 1.6 }}>
    凭据仅保存在当前浏览器的 localStorage 中，永不发送到 MBEditor 服务端；上传时直接与各平台 API 通讯（需在对应平台 CORS 设置中放行本站域名）。
  </div>
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/settings/ImageHostsSection.test.tsx`
  Expected: passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/settings/ImageHostsSection.tsx frontend/src/surfaces/settings/ImageHostsSection.test.tsx && git commit -m "Plan B Task 26: security note footer"`

---

## Stage 8: Editor integration + Playwright E2E

### Task 27: Locate existing image-upload call site

**Files:** `frontend/src/surfaces/editor/CenterStage.tsx`

- [ ] Step 1: Write the failing test
  Before writing code, grep to confirm current upload path. Run:
  `cd frontend && node -e "process.exit(require('fs').readFileSync('src/surfaces/editor/CenterStage.tsx','utf8').match(/upload/gi) ? 0 : 1)"`
  If no match, search for image drop/paste handlers:
  `cd frontend && node -e "const t=require('fs').readFileSync('src/surfaces/editor/CenterStage.tsx','utf8'); console.log(t.match(/drop|paste|File|image/gi))"`
  Document findings (which event handles image insertion) in the commit message.
  Test (add file `frontend/src/surfaces/editor/CenterStage.image-upload.test.tsx`):
  ```tsx
  import "@testing-library/jest-dom/vitest";
  import { describe, it, expect, vi } from "vitest";
  import { hasImageUploadDispatcher } from "./CenterStage";

  describe("CenterStage image upload dispatcher", () => {
    it("exposes helper for tests", () => {
      expect(typeof hasImageUploadDispatcher).toBe("function");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/editor/CenterStage.image-upload.test.tsx`
  Expected: export missing.
- [ ] Step 3: Implement minimal code
  At top of `CenterStage.tsx`, add an exported predicate + stub:
  ```ts
  export function hasImageUploadDispatcher(): boolean {
    return true; // filled in by Task 28
  }
  ```
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/editor/CenterStage.image-upload.test.tsx`
  Expected: passes.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/editor/CenterStage.tsx frontend/src/surfaces/editor/CenterStage.image-upload.test.tsx && git commit -m "Plan B Task 27: add upload dispatcher probe in CenterStage"`

### Task 28: Wire editor image insertion to `uploadWithActive`

**Files:** `frontend/src/surfaces/editor/CenterStage.tsx`, `frontend/src/surfaces/editor/CenterStage.image-upload.test.tsx`

- [ ] Step 1: Write the failing test — replace test contents:
  ```tsx
  import "@testing-library/jest-dom/vitest";
  import { describe, it, expect, vi } from "vitest";
  import { dispatchEditorImageUpload } from "./CenterStage";

  vi.mock("@/lib/image-hosts/dispatch", () => ({
    uploadWithActive: vi.fn().mockResolvedValue({ url: "https://cdn/x.png" }),
  }));

  describe("dispatchEditorImageUpload", () => {
    it("delegates to uploadWithActive and returns the url", async () => {
      const file = new File(["x"], "x.png", { type: "image/png" });
      const url = await dispatchEditorImageUpload(file);
      expect(url).toBe("https://cdn/x.png");
      const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
      expect(uploadWithActive).toHaveBeenCalledWith(file);
    });

    it("bubbles engine error when not configured", async () => {
      const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
      (uploadWithActive as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("图床未配置"));
      const file = new File(["x"], "x.png", { type: "image/png" });
      await expect(dispatchEditorImageUpload(file)).rejects.toThrow("图床未配置");
    });
  });
  ```
- [ ] Step 2: Run and verify fail
  `cd frontend && npx vitest run src/surfaces/editor/CenterStage.image-upload.test.tsx`
  Expected: `dispatchEditorImageUpload` not exported.
- [ ] Step 3: Implement minimal code
  In `CenterStage.tsx`, remove `hasImageUploadDispatcher` and add:
  ```ts
  import { uploadWithActive } from "@/lib/image-hosts/dispatch";

  export async function dispatchEditorImageUpload(file: File): Promise<string> {
    const res = await uploadWithActive(file);
    return res.url;
  }
  ```
  Then locate the existing image-insertion handler inside `CenterStage.tsx` (paste/drop/TipTap image button; refer to Task 27 findings). Replace any previous `api.post('/wechat/upload-image', ...)` call (or equivalent Plan A endpoint direct call) with `await dispatchEditorImageUpload(file)`, routing the returned URL to the existing insertion code path (TipTap `editor.chain().focus().setImage({ src: url })` etc.). Keep existing toast/error UX.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run src/surfaces/editor/CenterStage.image-upload.test.tsx`
  Expected: `2 passed`. Also run full suite: `cd frontend && npx vitest run` — all tests green.
- [ ] Step 5: Commit
  `git add frontend/src/surfaces/editor/CenterStage.tsx frontend/src/surfaces/editor/CenterStage.image-upload.test.tsx && git commit -m "Plan B Task 28: editor image upload delegates to active engine"`

### Task 29: Full vitest run — regression check

**Files:** — (no code change)

- [ ] Step 1: Write the failing test
  Run full test suite: `cd frontend && npx vitest run`.
- [ ] Step 2: Run and verify fail
  If any test is red, stop and open an issue. Otherwise this task is a verification gate — no commit.
- [ ] Step 3: Implement minimal code
  Fix any regression by revisiting prior tasks; do not skip.
- [ ] Step 4: Run and verify pass
  `cd frontend && npx vitest run`
  Expected: all tests pass.
- [ ] Step 5: Commit
  No commit (verification gate).

### Task 30: Build check

**Files:** — (no code change)

- [ ] Step 1: Write the failing test
  Run: `cd frontend && npm run build`.
- [ ] Step 2: Run and verify fail
  Ensure typecheck + Vite build succeed. Resolve any TypeScript errors introduced by new engines/forms.
- [ ] Step 3: Implement minimal code
  Fix type errors.
- [ ] Step 4: Run and verify pass
  `cd frontend && npm run build`
  Expected: `vite build` completes, no TS errors.
- [ ] Step 5: Commit
  No commit (verification gate).

### Task 31: Playwright E2E — GitHub engine test-upload

**Files:** `scripts/verify_image_host_settings.py`

- [ ] Step 1: Write the failing test
  Create `scripts/verify_image_host_settings.py`:
  ```python
  """
  Plan B E2E: verify the 图床 settings tab persists GitHub config and
  the 测试上传 button dispatches through the active engine.
  Runs against http://localhost:5173 (Vite dev server).
  """
  import asyncio
  import base64
  from pathlib import Path
  from playwright.async_api import async_playwright, Route

  SHOT_DIR = Path(__file__).resolve().parent.parent / "docs" / "screenshots" / "plan-b"
  SHOT_DIR.mkdir(parents=True, exist_ok=True)

  GH_RESPONSE = {
      "content": {
          "download_url": "https://raw.githubusercontent.com/me/img/main/2026/04/e2e.png",
          "path": "2026/04/e2e.png",
      }
  }

  async def main() -> None:
      async with async_playwright() as p:
          browser = await p.chromium.launch()
          context = await browser.new_context()
          page = await context.new_page()

          async def handle_github(route: Route) -> None:
              await route.fulfill(
                  status=201,
                  content_type="application/json",
                  body=__import__("json").dumps(GH_RESPONSE),
              )

          await context.route("https://api.github.com/**", handle_github)

          await page.goto("http://localhost:5173")
          # Navigate to Settings surface (adjust selector to project's sidebar)
          await page.get_by_role("button", name="设置").click()
          await page.get_by_role("button", name="图床").click()
          await page.get_by_role("radio", name="GitHub").check()

          await page.get_by_label("仓库").fill("me/img")
          await page.get_by_label("仓库").blur()
          await page.get_by_label("分支").fill("main")
          await page.get_by_label("分支").blur()
          await page.get_by_label("Access Token").fill("ghp_test")
          await page.get_by_label("Access Token").blur()

          await page.get_by_role("button", name="测试上传").click()

          result = page.get_by_test_id("imagehost-test-result")
          await result.wait_for(state="visible", timeout=5000)
          text = await result.text_content()
          assert text and "raw.githubusercontent.com/me/img" in text, f"unexpected result: {text}"

          storage = await page.evaluate("window.localStorage.getItem('mbeditor.imagehost')")
          assert storage and "ghp_test" in storage, "config not persisted"

          await page.screenshot(path=str(SHOT_DIR / "imagehost-github-success.png"))
          await browser.close()
          print("OK")

  if __name__ == "__main__":
      asyncio.run(main())
  ```
- [ ] Step 2: Run and verify fail
  Start the dev server (`cd frontend && npm run dev`) in another terminal, then run:
  `python scripts/verify_image_host_settings.py`
  Expected on first run: passes if Tasks 1–30 landed correctly; if selectors drift (e.g., sidebar 设置 button label mismatch), the script will time out — adjust script selectors to match MBEditor shell (consult `frontend/src/components/shell/Shell.tsx` for actual nav labels if needed).
- [ ] Step 3: Implement minimal code
  Adjust selectors as needed until the script passes.
- [ ] Step 4: Run and verify pass
  `python scripts/verify_image_host_settings.py`
  Expected: prints `OK`, produces `docs/screenshots/plan-b/imagehost-github-success.png`.
- [ ] Step 5: Commit
  `git add scripts/verify_image_host_settings.py docs/screenshots/plan-b/imagehost-github-success.png && git commit -m "Plan B Task 31: Playwright E2E for GitHub image host"`

### Task 32: Editor E2E — drop image uses active engine

**Files:** `scripts/verify_image_host_settings.py`

- [ ] Step 1: Write the failing test
  Extend the E2E script with a second scenario: while GitHub is active, navigate to an article, simulate dropping a file onto the editor, assert that the inserted `<img>` `src` matches the GitHub CDN URL. Append to `main()`:
  ```python
  await page.get_by_role("button", name="文章").click()
  await page.get_by_role("button", name=lambda n: n and ("新建" in n or "New" in n)).click()

  # Trigger editor image insert via a custom file drop
  png = base64.b64decode(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  )
  data_handle = await page.evaluate_handle(
      "(bytes) => new File([new Uint8Array(bytes)], 'drop.png', {type:'image/png'})",
      list(png),
  )
  await page.evaluate(
      """async (file) => {
          const dt = new DataTransfer();
          dt.items.add(file);
          const editor = document.querySelector('[data-testid=\"editor-root\"]') || document.querySelector('.ProseMirror');
          if (!editor) throw new Error('editor root not found');
          const evt = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
          editor.dispatchEvent(evt);
      }""",
      data_handle,
  )

  img = page.locator("img[src*='raw.githubusercontent.com/me/img']")
  await img.first.wait_for(state="attached", timeout=5000)
  await page.screenshot(path=str(SHOT_DIR / "imagehost-editor-drop.png"))
  ```
- [ ] Step 2: Run and verify fail
  `python scripts/verify_image_host_settings.py`
  Expected: fails if editor root selector is wrong — adjust until the inserted `<img>` appears.
- [ ] Step 3: Implement minimal code
  Add `data-testid="editor-root"` to the outer editor wrapper in `CenterStage.tsx` if missing, to provide a stable hook.
- [ ] Step 4: Run and verify pass
  `python scripts/verify_image_host_settings.py`
  Expected: `OK`.
- [ ] Step 5: Commit
  `git add scripts/verify_image_host_settings.py frontend/src/surfaces/editor/CenterStage.tsx docs/screenshots/plan-b/imagehost-editor-drop.png && git commit -m "Plan B Task 32: E2E asserts editor drop uses active engine"`

---

## Verification checklist

Run each of these exactly and confirm the expected result before declaring Plan B complete.

- [ ] **Unit test suite** — `cd D:/Web/MBEditor/frontend && npx vitest run`
      Expected: all suites pass (image-hosts/__tests__, stores/__tests__, surfaces/settings, surfaces/editor).
- [ ] **Build** — `cd D:/Web/MBEditor/frontend && npm run build`
      Expected: `tsc -b` clean, `vite build` produces `dist/` without warnings.
- [ ] **Deps installed** — `cd D:/Web/MBEditor/frontend && node -e "['ali-oss','cos-js-sdk-v5','@aws-sdk/client-s3','uuid'].forEach(m => require.resolve(m))"`
      Expected: exits 0.
- [ ] **Engine registry count** — `cd D:/Web/MBEditor/frontend && node -e "import('./src/lib/image-hosts/registry.ts').then(m => console.log(m.listEngines().map(e=>e.id).join(',')))" 2>&1`
      Expected: `default,github,aliyun,tencent-cos,cloudflare-r2` (when run via a Vite/tsx-capable runner; fallback is to rely on vitest output).
- [ ] **LocalStorage key present after config** — via Playwright E2E: `python D:/Web/MBEditor/scripts/verify_image_host_settings.py`
      Expected: stdout `OK`; screenshots written under `docs/screenshots/plan-b/`.
- [ ] **Default engine still works** — With active engine `default`, drop an image in the editor against a running backend (Plan A proxy). Expected: `<img>` `src` begins with `https://mmbiz.qpic.cn/`.
- [ ] **GitHub engine upload** — In browser devtools on the settings 图床 tab with GitHub active and a real token, click 测试上传. Expected: test result shows a `raw.githubusercontent.com` URL (or `cdn.jsdelivr.net` if useCDN is on).
- [ ] **Aliyun engine upload** — Same flow with Aliyun creds. Expected: URL on `<bucket>.<region>.aliyuncs.com` or configured customDomain.
- [ ] **Tencent COS engine upload** — Same flow. Expected: URL on `<bucket>.cos.<region>.myqcloud.com` or configured customDomain.
- [ ] **Cloudflare R2 engine upload** — Same flow. Expected: URL on configured `publicDomain`.
- [ ] **No backend secret leakage** — `cd D:/Web/MBEditor && grep -R "accessToken\|accessKeyId\|secretAccessKey\|SecretId" backend/` — expected: no matches; backend is not aware of these credentials.
- [ ] **Persistence survives reload** — After configuring any non-default engine and reloading the page: Settings 图床 shows the same active engine and masked fields still populated (the store rehydrates from `mbeditor.imagehost`).
