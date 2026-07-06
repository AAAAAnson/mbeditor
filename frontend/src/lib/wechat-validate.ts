// Thin typed client for POST /api/v1/wechat/validate.
//
// Re-exports the finding types the rest of the UI already consumes from
// ``components/validation/types`` so there is exactly one source of truth
// for the validator shape. ``ValidationIssue`` / ``ValidationWarning`` are
// nominal aliases — the backend treats them as the same record schema but
// the UI benefits from the distinction when reading call sites.
//
// Fails open: if the validator endpoint is down or returns malformed data
// we resolve to ``{ok: false, error}`` so the caller can log + proceed
// instead of wedging the editor.

import api from "@/lib/api";
import type { ApiResponse } from "@/types";
import type { ValidationFinding, ValidationReport } from "@/components/validation/types";

export type ValidationIssue = ValidationFinding;
export type ValidationWarning = ValidationFinding;
export type { ValidationFinding, ValidationReport };

export interface ValidateSuccess {
  ok: true;
  report: ValidationReport;
}

export interface ValidateFailure {
  ok: false;
  error: string;
}

export type ValidateResult = ValidateSuccess | ValidateFailure;

const EMPTY_STATS = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

function isFindingArray(value: unknown): value is ValidationFinding[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      typeof record.rule === "string" &&
      typeof record.message === "string" &&
      typeof record.suggestion === "string" &&
      (typeof record.line === "number" || typeof record.line === "undefined")
    );
  });
}

function normalizeReport(raw: unknown): ValidationReport | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFindingArray(record.issues)) return null;
  if (!isFindingArray(record.warnings)) return null;
  const stats =
    record.stats && typeof record.stats === "object"
      ? { ...EMPTY_STATS, ...(record.stats as Record<string, number>) }
      : EMPTY_STATS;
  return {
    issues: record.issues,
    warnings: record.warnings,
    stats,
  };
}

export interface ValidateOptions {
  /** AbortSignal from the caller (e.g. debounced hook) for cancellation. */
  signal?: AbortSignal;
}

/**
 * Call the WeChat compatibility validator.
 *
 * Never throws. Network/server failures resolve to ``{ok: false, error}``.
 */
export async function validateWechatHtml(
  html: string,
  options: ValidateOptions = {},
): Promise<ValidateResult> {
  try {
    const res = await api.post<ApiResponse<ValidationReport>>(
      "/wechat/validate",
      { html },
      { signal: options.signal },
    );
    if (res.data.code !== 0) {
      return { ok: false, error: res.data.message || "校验服务返回错误" };
    }
    const report = normalizeReport(res.data.data);
    if (!report) {
      return { ok: false, error: "校验服务返回格式错误" };
    }
    return { ok: true, report };
  } catch (error) {
    if (error instanceof Error) {
      // Axios marks cancelled requests with ``name === 'CanceledError'``.
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return { ok: false, error: "aborted" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "校验服务不可用" };
  }
}

export function reportIsBlocking(report: ValidationReport): boolean {
  return report.issues.length > 0;
}

// ── SVG/SMIL 发布前预警(前端检测,后端零改)──────────────────────────
// SMIL 动画(<animate>/<animateTransform>/<animateMotion>/<set>)在「交互预览」能动,
// 但发到公众号草稿箱会被微信 sanitize 成静态,用户预期落差。在发布动作前预警(信息级、
// 可继续)。注:validate_html 本是 CLI/API/前端共享真值源,理想应由后端 svg_validator
// 把「存在 SMIL」记为 warning(stats 已有 animate_count 等计数);此处为守「后端零改」
// 铁律先在前端做轻量检测,后端补齐后应改为消费 report.warnings。
export interface SmilCounts {
  animate: number;
  animateTransform: number;
  animateMotion: number;
  set: number;
  total: number;
}

export function detectSmilAnimations(html: string): SmilCounts {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  // <animate(?![a-zA-Z]) 只匹配裸 <animate(后接空白/斜杠/>),不误吃 <animateTransform>
  // /<animatething>;<set\b 借词边界避开 <settings>。
  const animate = count(/<animate(?![a-zA-Z])/gi);
  const animateTransform = count(/<animateTransform\b/gi);
  const animateMotion = count(/<animateMotion\b/gi);
  const set = count(/<set\b/gi);
  return {
    animate,
    animateTransform,
    animateMotion,
    set,
    total: animate + animateTransform + animateMotion + set,
  };
}

export function hasSmilAnimation(html: string): boolean {
  return detectSmilAnimations(html).total > 0;
}

export function buildSmilWarning(counts: SmilCounts): ValidationFinding {
  return {
    line: 0,
    rule: "smil-static-on-publish",
    message: `检测到 ${counts.total} 处 SVG 动画。发到公众号后，微信会把它们清成静态图，动效只在「交互预览」里能看到。`,
    suggestion: "想要好看的静态版式可以直接继续；若一定要动起来，考虑改用 GIF 或视频。",
  };
}

// ── blob: 图片硬闸(发布/复制前,前端检测,后端零改)──────────────────
// Chromium 粘贴截图默认插 blob: URL;blob: 只在当前页面会话有效,后端两条搬图
// 路径(草稿上传只认 http/data:、复制内联只认可 fetch 的)都无能为力 → 发出去
// 必裂,且页面刷新即失效、没有自动补救路径,检出即硬中止。data:/http(s) 不算
// (data: 后端本就能上传)。
export function findBlobImages(html: string): string[] {
  if (!html || !/blob:/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.trim().toLowerCase().startsWith("blob:"));
}

export function reportIsEmpty(report: ValidationReport): boolean {
  return report.issues.length === 0 && report.warnings.length === 0;
}
