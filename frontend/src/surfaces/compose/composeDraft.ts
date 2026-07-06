// frontend/src/surfaces/compose/composeDraft.ts
// compose 草稿 sessionStorage 的唯一真源:key/格式/默认值集中在这,
// ComposeSurface(恢复)与 HomeSurface(首页一句话直达)共用,防两处硬编码漂移。
// 一句话 + 已选项实时镜像到 sessionStorage,刷新 /new 能恢复,避免小白填一半丢稿。
// 不进 localStorage(只想保住「当前这次起稿」,关页/重开浏览器不该残留)。
import type { ComposeAnswers } from "./ComposeSurface";

export const DRAFT_KEY = "mbeditor.compose.draft";

export const EMPTY_ANSWERS: ComposeAnswers = {
  intent: "",
  audience: "",
  tone: "",
  voiceSample: "",
  useBrandVoice: false,
};

export function loadDraft(): ComposeAnswers {
  if (typeof window === "undefined") return EMPTY_ANSWERS;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_ANSWERS;
    const parsed = JSON.parse(raw) as Partial<ComposeAnswers>;
    return {
      intent: typeof parsed.intent === "string" ? parsed.intent : "",
      audience: (parsed.audience as ComposeAnswers["audience"]) ?? "",
      tone: (parsed.tone as ComposeAnswers["tone"]) ?? "",
      voiceSample: typeof parsed.voiceSample === "string" ? parsed.voiceSample : "",
      useBrandVoice: Boolean(parsed.useBrandVoice),
    };
  } catch {
    return EMPTY_ANSWERS;
  }
}

export function saveDraft(answers: ComposeAnswers): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
  } catch {
    // sessionStorage 不可用(隐私模式 / 配额)时静默降级,不挡起稿。
  }
}
