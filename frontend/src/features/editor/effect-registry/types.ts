export type EffectCategory =
  | "expand"
  | "carousel"
  | "slide"
  | "longpress"
  | "quiz"
  | "flip";

export interface TextSlot {
  name: string;
  label: string;
  default: string;
  maxLength: number;
}

export interface ImageSlot {
  name: string;
  label: string;
  default: string;
}

export interface ColorSlot {
  name: string;
  label: string;
  default: string;
}

export interface TimingParam {
  name: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface Effect {
  id: string;
  category: EffectCategory;
  title: string;
  description: string;
  textSlots: TextSlot[];
  imageSlots: ImageSlot[];
  colorSlots: ColorSlot[];
  timingParams: TimingParam[];
}

export const CATEGORY_LABEL: Record<EffectCategory, string> = {
  expand: "展开",
  carousel: "轮播",
  slide: "滑动",
  longpress: "长按",
  quiz: "答题",
  flip: "翻卡",
};

export interface RenderEffectPayload {
  textSlots?: Record<string, string>;
  imageSlots?: Record<string, string>;
  colorSlots?: Record<string, string>;
  timingParams?: Record<string, number>;
}

export interface RenderEffectResult {
  status: "ok" | "error" | "failed";
  html: string;
  warnings: unknown[];
  report: unknown;
  message?: string;
}
