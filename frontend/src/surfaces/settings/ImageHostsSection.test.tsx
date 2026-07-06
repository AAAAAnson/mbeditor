import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageHostsSection from "./ImageHostsSection";
import { useImageHostStore } from "@/stores/imageHostStore";

describe("ImageHostsSection picker", () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.localStorage.clear();
    useImageHostStore.setState({ activeHostId: "default", configs: {} });
  });

  it("renders 5 engine options and marks active", () => {
    const { container } = render(<ImageHostsSection />);
    expect(screen.getByRole("heading", { name: "图床" })).toBeInTheDocument();
    expect(container.querySelectorAll(".ss-card").length).toBeGreaterThan(0);
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

  it("shows R2 form when selected", () => {
    render(<ImageHostsSection />);
    fireEvent.click(screen.getByRole("radio", { name: "Cloudflare R2" }));
    expect(screen.getByLabelText("Account ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Access Key ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Secret Access Key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
    expect(screen.getByLabelText("Public Domain")).toBeInTheDocument();
  });

  it("shows info copy when default engine active (no form)", () => {
    render(<ImageHostsSection />);
    expect(screen.getByTestId("imagehost-default-info")).toHaveTextContent(/公众号素材库/);
  });

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

  it("shows security note", () => {
    render(<ImageHostsSection />);
    expect(screen.getByTestId("imagehost-security-note"))
      .toHaveTextContent(/仅保存在内存/);
  });
});
