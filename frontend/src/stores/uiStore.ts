import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleMode } from "@/types";

export type Theme = "light" | "dark";
export type Accent = "default" | "mono";
export type Density = "compact" | "comfy" | "spacious";
export type Layout = "focus" | "split" | "triptych";
export type UIMode = "simple" | "pro";
export type FontFamily = "rounded" | "serif" | "system";
export type AgentPosition = "right" | "bottom";

const DEFAULT_PREVIEW_FRAME_WIDTH = 420;
const DEFAULT_PREVIEW_FRAME_HEIGHT = 760;
const DEFAULT_PREVIEW_SCALE = 1;
const DEFAULT_CODE_DRAWER_WIDTH = 720;

function clampPreviewWidth(width: number) {
  return Math.min(960, Math.max(320, Math.round(width)));
}

function clampCodeDrawerWidth(width: number) {
  return Math.min(1400, Math.max(360, Math.round(width)));
}

function clampPreviewHeight(height: number) {
  return Math.min(1400, Math.max(360, Math.round(height)));
}

function clampPreviewScale(scale: number) {
  return Math.min(2, Math.max(0.4, Math.round(scale * 100) / 100));
}

interface UIState {
  theme: Theme;
  accent: Accent;
  density: Density;
  layout: Layout;
  uiMode: UIMode;
  fontFamily: FontFamily;
  agentPosition: AgentPosition;
  editorDefaultMode: ArticleMode;
  editorAutoSave: boolean;
  editorFontSize: number;
  editorPreviewWidth: number;
  editorPreviewHeight: number;
  editorPreviewScale: number;
  phonePreviewMode: boolean;
  codeDrawerOpen: boolean;
  codeDrawerWidth: number;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setLayout: (l: Layout) => void;
  setUiMode: (m: UIMode) => void;
  setFontFamily: (f: FontFamily) => void;
  /** Derived layout: 'simple' forces 全屏可编辑预览 (focus); 'pro' keeps stored layout. */
  effectiveLayout: () => Layout;
  setAgentPosition: (p: AgentPosition) => void;
  setEditorDefaultMode: (mode: ArticleMode) => void;
  setEditorAutoSave: (enabled: boolean) => void;
  setEditorFontSize: (size: number) => void;
  setEditorPreviewSize: (size: { width?: number; height?: number }) => void;
  setEditorPreviewScale: (scale: number) => void;
  resetEditorPreviewSize: () => void;
  resetEditorPreviewScale: () => void;
  setPhonePreviewMode: (on: boolean) => void;
  setCodeDrawerOpen: (open: boolean) => void;
  setCodeDrawerWidth: (width: number) => void;
}

/** persist v0(旧 cozy/walnut/paper/swiss)→ v1(light|dark)。导出供单测直接验。 */
export function migrateUiState(persisted: unknown): unknown {
  const s = (persisted ?? {}) as Record<string, unknown>;
  if (s.theme === "cozy" || s.theme === "paper") s.theme = "light";
  else if (s.theme === "swiss" || s.theme === "walnut") s.theme = "dark";
  else if (s.theme !== "light" && s.theme !== "dark") s.theme = "light";
  return s;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "light",
      accent: "default",
      density: "comfy",
      layout: "triptych",
      uiMode: "simple",
      fontFamily: "rounded",
      agentPosition: "right",
      editorDefaultMode: "html",
      editorAutoSave: true,
      editorFontSize: 14,
      editorPreviewWidth: DEFAULT_PREVIEW_FRAME_WIDTH,
      editorPreviewHeight: DEFAULT_PREVIEW_FRAME_HEIGHT,
      editorPreviewScale: DEFAULT_PREVIEW_SCALE,
      phonePreviewMode: false,
      codeDrawerOpen: false,
      codeDrawerWidth: DEFAULT_CODE_DRAWER_WIDTH,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setLayout: (layout) => set({ layout }),
      setUiMode: (uiMode) => set({ uiMode }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      effectiveLayout: () => {
        const { uiMode, layout } = get();
        return uiMode === "simple" ? "focus" : layout;
      },
      setAgentPosition: (agentPosition) => set({ agentPosition }),
      setEditorDefaultMode: (editorDefaultMode) => set({ editorDefaultMode }),
      setEditorAutoSave: (editorAutoSave) => set({ editorAutoSave }),
      setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
      setEditorPreviewSize: ({ width, height }) =>
        set((state) => ({
          editorPreviewWidth: clampPreviewWidth(width ?? state.editorPreviewWidth),
          editorPreviewHeight: clampPreviewHeight(height ?? state.editorPreviewHeight),
        })),
      setEditorPreviewScale: (editorPreviewScale) =>
        set({ editorPreviewScale: clampPreviewScale(editorPreviewScale) }),
      resetEditorPreviewSize: () =>
        set({
          editorPreviewWidth: DEFAULT_PREVIEW_FRAME_WIDTH,
          editorPreviewHeight: DEFAULT_PREVIEW_FRAME_HEIGHT,
        }),
      resetEditorPreviewScale: () => set({ editorPreviewScale: DEFAULT_PREVIEW_SCALE }),
      setPhonePreviewMode: (phonePreviewMode) => set({ phonePreviewMode }),
      setCodeDrawerOpen: (codeDrawerOpen) => set({ codeDrawerOpen }),
      setCodeDrawerWidth: (codeDrawerWidth) =>
        set({ codeDrawerWidth: clampCodeDrawerWidth(codeDrawerWidth) }),
    }),
    {
      name: "mbeditor.ui",
      version: 1,
      migrate: (persisted) => migrateUiState(persisted) as UIState,
      partialize: (state) => ({
        theme: state.theme,
        accent: state.accent,
        density: state.density,
        layout: state.layout,
        uiMode: state.uiMode,
        fontFamily: state.fontFamily,
        agentPosition: state.agentPosition,
        editorDefaultMode: state.editorDefaultMode,
        editorAutoSave: state.editorAutoSave,
        editorFontSize: state.editorFontSize,
        editorPreviewWidth: state.editorPreviewWidth,
        editorPreviewHeight: state.editorPreviewHeight,
        editorPreviewScale: state.editorPreviewScale,
        phonePreviewMode: state.phonePreviewMode,
        codeDrawerWidth: state.codeDrawerWidth,
      }),
    }
  )
);
