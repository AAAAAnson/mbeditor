import { vi } from "vitest";

/** 在 render 前调用,强制 useMediaQuery/useIsMobile 读到指定视口态。
 *  afterEach 的 vi.unstubAllGlobals()(见 src/test-setup.ts)会自动还原。 */
export function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
