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
    vi.spyOn(mod.githubEngine, "isConfigured").mockReturnValue(true);
    const file = new File(["x"], "x.png", { type: "image/png" });
    const res = await uploadWithActive(file);
    expect(fakeUpload).toHaveBeenCalled();
    expect(res.url).toBe("https://cdn/x.png");
  });
});
