import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleMode } from "@/types";

export type Theme = "walnut" | "paper" | "swiss";
export type Accent = "default" | "mono";
export type Density = "compact" | "comfy" | "spacious";
export type Layout = "focus" | "split" | "triptych";
export type AgentPosition = "right" | "bottom";

const DEFAULT_PREVIEW_FRAME_WIDTH = 420;
const DEFAULT_PREVIEW_FRAME_HEIGHT = 760;

function clampPreviewWidth(width: number) {
  return Math.min(960, Math.max(320, Math.round(width)));
}

function clampPreviewHeight(height: number) {
  return Math.min(1400, Math.max(360, Math.round(height)));
}

interface UIState {
  theme: Theme;
  accent: Accent;
  density: Density;
  layout: Layout;
  agentPosition: AgentPosition;
  editorDefaultMode: ArticleMode;
  editorAutoSave: boolean;
  editorFontSize: number;
  editorPreviewWidth: number;
  editorPreviewHeight: number;
  tweaksOpen: boolean;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setLayout: (l: Layout) => void;
  setAgentPosition: (p: AgentPosition) => void;
  setEditorDefaultMode: (mode: ArticleMode) => void;
  setEditorAutoSave: (enabled: boolean) => void;
  setEditorFontSize: (size: number) => void;
  setEditorPreviewSize: (size: { width?: number; height?: number }) => void;
  resetEditorPreviewSize: () => void;
  setTweaksOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "walnut",
      accent: "default",
      density: "comfy",
      layout: "triptych",
      agentPosition: "right",
      editorDefaultMode: "html",
      editorAutoSave: true,
      editorFontSize: 14,
      editorPreviewWidth: DEFAULT_PREVIEW_FRAME_WIDTH,
      editorPreviewHeight: DEFAULT_PREVIEW_FRAME_HEIGHT,
      tweaksOpen: false,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setLayout: (layout) => set({ layout }),
      setAgentPosition: (agentPosition) => set({ agentPosition }),
      setEditorDefaultMode: (editorDefaultMode) => set({ editorDefaultMode }),
      setEditorAutoSave: (editorAutoSave) => set({ editorAutoSave }),
      setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
      setEditorPreviewSize: ({ width, height }) =>
        set((state) => ({
          editorPreviewWidth: clampPreviewWidth(width ?? state.editorPreviewWidth),
          editorPreviewHeight: clampPreviewHeight(height ?? state.editorPreviewHeight),
        })),
      resetEditorPreviewSize: () =>
        set({
          editorPreviewWidth: DEFAULT_PREVIEW_FRAME_WIDTH,
          editorPreviewHeight: DEFAULT_PREVIEW_FRAME_HEIGHT,
        }),
      setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
    }),
    {
      name: "mbeditor.ui",
      partialize: (state) => ({
        theme: state.theme,
        accent: state.accent,
        density: state.density,
        layout: state.layout,
        agentPosition: state.agentPosition,
        editorDefaultMode: state.editorDefaultMode,
        editorAutoSave: state.editorAutoSave,
        editorFontSize: state.editorFontSize,
        editorPreviewWidth: state.editorPreviewWidth,
        editorPreviewHeight: state.editorPreviewHeight,
      }),
    }
  )
);
