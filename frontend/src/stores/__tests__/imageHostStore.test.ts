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

  it("persists non-sensitive image host settings to mbeditor.imagehost key", () => {
    useImageHostStore.getState().setActiveHost("github");
    useImageHostStore.getState().setConfig("github", {
      repo: "me/img", branch: "main", accessToken: "tok", useCDN: true,
    });
    useImageHostStore.getState().setConfig("aliyun", {
      accessKeyId: "aliyun-key-id",
      accessKeySecret: "aliyun-secret",
      bucket: "oss-bucket",
      region: "oss-cn-hangzhou",
      customDomain: "https://oss.example.com",
    });
    useImageHostStore.getState().setConfig("tencent-cos", {
      secretId: "cos-secret-id",
      secretKey: "cos-secret-key",
      bucket: "cos-bucket",
      region: "ap-guangzhou",
      customDomain: "https://cos.example.com",
    });
    useImageHostStore.getState().setConfig("cloudflare-r2", {
      accountId: "account",
      accessKeyId: "r2-key-id",
      secretAccessKey: "r2-secret",
      bucket: "r2-bucket",
      publicDomain: "https://r2.example.com",
    });

    const raw = window.localStorage.getItem("mbeditor.imagehost");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeHostId).toBe("github");
    expect(parsed.state.configs.github).toEqual({
      repo: "me/img",
      branch: "main",
      useCDN: true,
    });
    expect(parsed.state.configs.aliyun).toEqual({
      bucket: "oss-bucket",
      region: "oss-cn-hangzhou",
      customDomain: "https://oss.example.com",
    });
    expect(parsed.state.configs["tencent-cos"]).toEqual({
      bucket: "cos-bucket",
      region: "ap-guangzhou",
      customDomain: "https://cos.example.com",
    });
    expect(parsed.state.configs["cloudflare-r2"]).toEqual({
      accountId: "account",
      bucket: "r2-bucket",
      publicDomain: "https://r2.example.com",
    });
    expect(raw).not.toContain("tok");
    expect(raw).not.toContain("aliyun-key-id");
    expect(raw).not.toContain("aliyun-secret");
    expect(raw).not.toContain("cos-secret-id");
    expect(raw).not.toContain("cos-secret-key");
    expect(raw).not.toContain("r2-key-id");
    expect(raw).not.toContain("r2-secret");
  });

  it("scrubs legacy persisted image host secrets during rehydrate", async () => {
    window.localStorage.setItem(
      "mbeditor.imagehost",
      JSON.stringify({
        state: {
          activeHostId: "github",
          configs: {
            github: { repo: "me/img", branch: "main", accessToken: "legacy-token", useCDN: false },
            aliyun: {
              accessKeyId: "legacy-ak",
              accessKeySecret: "legacy-aks",
              bucket: "oss-bucket",
              region: "oss-cn-hangzhou",
            },
            "tencent-cos": {
              secretId: "legacy-sid",
              secretKey: "legacy-skey",
              bucket: "cos-bucket",
              region: "ap-guangzhou",
            },
            "cloudflare-r2": {
              accountId: "account",
              accessKeyId: "legacy-r2-ak",
              secretAccessKey: "legacy-r2-secret",
              bucket: "r2-bucket",
              publicDomain: "https://r2.example.com",
            },
          },
        },
        version: 0,
      })
    );

    await useImageHostStore.persist.rehydrate();

    expect(useImageHostStore.getState().configs.github).toEqual({
      repo: "me/img",
      branch: "main",
      accessToken: "",
      useCDN: false,
    });
    expect(useImageHostStore.getState().configs.aliyun).toEqual({
      accessKeyId: "",
      accessKeySecret: "",
      bucket: "oss-bucket",
      region: "oss-cn-hangzhou",
    });
    expect(useImageHostStore.getState().configs["tencent-cos"]).toEqual({
      secretId: "",
      secretKey: "",
      bucket: "cos-bucket",
      region: "ap-guangzhou",
    });
    expect(useImageHostStore.getState().configs["cloudflare-r2"]).toEqual({
      accountId: "account",
      accessKeyId: "",
      secretAccessKey: "",
      bucket: "r2-bucket",
      publicDomain: "https://r2.example.com",
    });

    const raw = window.localStorage.getItem("mbeditor.imagehost")!;
    expect(raw).not.toContain("legacy-token");
    expect(raw).not.toContain("legacy-ak");
    expect(raw).not.toContain("legacy-aks");
    expect(raw).not.toContain("legacy-sid");
    expect(raw).not.toContain("legacy-skey");
    expect(raw).not.toContain("legacy-r2-ak");
    expect(raw).not.toContain("legacy-r2-secret");
  });
});
