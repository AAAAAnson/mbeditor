import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsSurface from "./SettingsSurface";
import { useUIStore } from "@/stores/uiStore";

const getMock = vi.fn();
const putMock = vi.fn();
const postMock = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

describe("SettingsSurface", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.setState({
      theme: "walnut",
      density: "comfy",
      layout: "triptych",
      editorDefaultMode: "html",
      editorAutoSave: true,
      editorFontSize: 14,
      tweaksOpen: false,
    });

    getMock.mockImplementation((url: string) => {
      if (url === "/config") {
        return Promise.resolve({ data: { code: 0, data: { appid: "", appsecret: "", configured: false } } });
      }
      if (url === "/version") {
        return Promise.resolve({ data: { code: 0, data: { version: "4.1.0", repo: "AAAAAnson/mbeditor" } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    putMock.mockResolvedValue({ data: { code: 0, data: { appid: "wx123", appsecret: "****abcd", configured: true } } });
    postMock.mockResolvedValue({ data: { code: 0, data: { valid: true } } });
  });

  it("shows density controls in the appearance section", async () => {
    render(<SettingsSurface go={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "界面" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /紧凑/ })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /舒适/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /宽松/ })).toBeInTheDocument();
  });
});
