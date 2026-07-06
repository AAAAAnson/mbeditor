import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ImageHostConfigs, ImageHostId } from "@/lib/image-hosts/types";

interface ImageHostState {
  activeHostId: ImageHostId;
  configs: ImageHostConfigs;
  setActiveHost: (id: ImageHostId) => void;
  setConfig: <K extends keyof ImageHostConfigs>(id: K, cfg: ImageHostConfigs[K]) => void;
  clearConfig: (id: ImageHostId) => void;
}

type PersistedImageHostConfigs = {
  default?: Record<string, never>;
  github?: Pick<NonNullable<ImageHostConfigs["github"]>, "repo" | "branch" | "useCDN">;
  aliyun?: Pick<NonNullable<ImageHostConfigs["aliyun"]>, "bucket" | "region" | "customDomain">;
  "tencent-cos"?: Pick<NonNullable<ImageHostConfigs["tencent-cos"]>, "bucket" | "region" | "customDomain">;
  "cloudflare-r2"?: Pick<NonNullable<ImageHostConfigs["cloudflare-r2"]>, "accountId" | "bucket" | "publicDomain">;
};

interface PersistedImageHostState {
  activeHostId: ImageHostId;
  configs: PersistedImageHostConfigs;
}

const IMAGE_HOST_IDS: ImageHostId[] = ["default", "github", "aliyun", "tencent-cos", "cloudflare-r2"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isImageHostId(value: unknown): value is ImageHostId {
  return typeof value === "string" && IMAGE_HOST_IDS.includes(value as ImageHostId);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toPersistedConfigs(configs: ImageHostConfigs): PersistedImageHostConfigs {
  const persisted: PersistedImageHostConfigs = {};

  if (configs.default) {
    persisted.default = {};
  }

  if (configs.github) {
    const { repo, branch, useCDN } = configs.github;
    persisted.github = { repo, branch, useCDN };
  }

  if (configs.aliyun) {
    const { bucket, region, customDomain } = configs.aliyun;
    persisted.aliyun = { bucket, region, customDomain };
  }

  if (configs["tencent-cos"]) {
    const { bucket, region, customDomain } = configs["tencent-cos"];
    persisted["tencent-cos"] = { bucket, region, customDomain };
  }

  if (configs["cloudflare-r2"]) {
    const { accountId, bucket, publicDomain } = configs["cloudflare-r2"];
    persisted["cloudflare-r2"] = { accountId, bucket, publicDomain };
  }

  return persisted;
}

function hydrateConfigs(configs: unknown): ImageHostConfigs {
  if (!isRecord(configs)) {
    return {};
  }

  const hydrated: ImageHostConfigs = {};

  if (isRecord(configs.default)) {
    hydrated.default = {};
  }

  if (isRecord(configs.github)) {
    hydrated.github = {
      repo: stringValue(configs.github.repo),
      branch: typeof configs.github.branch === "string" ? configs.github.branch : "main",
      accessToken: "",
      useCDN: Boolean(configs.github.useCDN),
    };
  }

  if (isRecord(configs.aliyun)) {
    hydrated.aliyun = {
      accessKeyId: "",
      accessKeySecret: "",
      bucket: stringValue(configs.aliyun.bucket),
      region: stringValue(configs.aliyun.region),
      customDomain: stringValue(configs.aliyun.customDomain) || undefined,
    };
  }

  if (isRecord(configs["tencent-cos"])) {
    hydrated["tencent-cos"] = {
      secretId: "",
      secretKey: "",
      bucket: stringValue(configs["tencent-cos"].bucket),
      region: stringValue(configs["tencent-cos"].region),
      customDomain: stringValue(configs["tencent-cos"].customDomain) || undefined,
    };
  }

  if (isRecord(configs["cloudflare-r2"])) {
    hydrated["cloudflare-r2"] = {
      accountId: stringValue(configs["cloudflare-r2"].accountId),
      accessKeyId: "",
      secretAccessKey: "",
      bucket: stringValue(configs["cloudflare-r2"].bucket),
      publicDomain: stringValue(configs["cloudflare-r2"].publicDomain),
    };
  }

  return hydrated;
}

function toPersistedImageHostState(state: Pick<ImageHostState, "activeHostId" | "configs">): PersistedImageHostState {
  return {
    activeHostId: state.activeHostId,
    configs: toPersistedConfigs(state.configs),
  };
}

function sanitizeImageHostStorageValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || !isRecord(parsed.state)) {
      return value;
    }

    const state = parsed.state;
    const sanitized: { state: PersistedImageHostState; version?: unknown } = {
      ...parsed,
      state: {
        activeHostId: isImageHostId(state.activeHostId) ? state.activeHostId : "default",
        configs: toPersistedConfigs(hydrateConfigs(state.configs)),
      },
    };

    return JSON.stringify(sanitized);
  } catch {
    return value;
  }
}

function createScrubbedLocalStorage(scrub: (value: string) => string): StateStorage {
  return {
    getItem: (name) => {
      const value = localStorage.getItem(name);
      if (value === null) {
        return null;
      }
      const scrubbed = scrub(value);
      if (scrubbed !== value) {
        localStorage.setItem(name, scrubbed);
      }
      return scrubbed;
    },
    setItem: (name, value) => localStorage.setItem(name, scrub(value)),
    removeItem: (name) => localStorage.removeItem(name),
  };
}

export const useImageHostStore = create<ImageHostState>()(
  persist<ImageHostState, [], [], PersistedImageHostState>(
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
      storage: createJSONStorage<PersistedImageHostState>(() =>
        createScrubbedLocalStorage(sanitizeImageHostStorageValue)
      ),
      partialize: toPersistedImageHostState,
      merge: (persistedState, currentState) => {
        if (!isRecord(persistedState)) {
          return currentState;
        }

        return {
          ...currentState,
          activeHostId: isImageHostId(persistedState.activeHostId)
            ? persistedState.activeHostId
            : currentState.activeHostId,
          configs: hydrateConfigs(persistedState.configs),
        };
      },
    }
  )
);
