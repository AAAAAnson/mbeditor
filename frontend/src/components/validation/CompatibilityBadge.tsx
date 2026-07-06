import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { IconCheck, IconInfo, IconWarn } from "@/components/icons";
import type { ApiResponse } from "@/types";
import ValidationDialog from "./ValidationDialog";
import type { ValidationReport } from "./types";

interface CompatibilityBadgeProps {
  html: string;
  // ms; 0 disables debounce (used by tests).
  debounceMs?: number;
}

type Tone = "ok" | "warn" | "issue" | "loading" | "error";

function toneFor(report: ValidationReport | null, loading: boolean, error: boolean): Tone {
  if (loading) return "loading";
  if (error) return "error";
  if (!report) return "ok";
  if (report.issues.length > 0) return "issue";
  if (report.warnings.length > 0) return "warn";
  return "ok";
}

const TONE_STYLE: Record<Tone, { color: string; bg: string; border: string }> = {
  ok:      { color: "var(--forest)", bg: "var(--forest-soft)", border: "color-mix(in oklab, var(--forest) 35%, transparent)" },
  warn:    { color: "var(--warning-ink)", bg: "var(--warning-soft)", border: "color-mix(in oklab, var(--warn) 35%, transparent)" },
  issue:   { color: "var(--danger-ink)", bg: "var(--danger-soft)", border: "color-mix(in oklab, var(--danger) 35%, transparent)" },
  loading: { color: "var(--fg-4)", bg: "transparent", border: "var(--line)" },
  error:   { color: "var(--fg-4)", bg: "transparent", border: "var(--line)" },
};

function labelFor(report: ValidationReport | null, tone: Tone): string {
  if (tone === "loading") return "检查中";
  if (tone === "error") return "检查未完成";
  if (!report) return "兼容";
  const { issues, warnings } = report;
  if (issues.length > 0) return `${issues.length} 违规${warnings.length ? ` · ${warnings.length} 警告` : ""}`;
  if (warnings.length > 0) return `${warnings.length} 警告`;
  return "兼容";
}

function iconFor(tone: Tone) {
  if (tone === "issue" || tone === "warn") return <IconWarn size={13} />;
  if (tone === "error" || tone === "loading") return <IconInfo size={13} />;
  return <IconCheck size={13} />;
}

export default function CompatibilityBadge({ html, debounceMs = 800 }: CompatibilityBadgeProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!html.trim()) {
      setReport({ issues: [], warnings: [], stats: { svg_count: 0, animate_count: 0, animate_transform_count: 0, set_count: 0, anchor_count: 0 } });
      setLoading(false);
      setError(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);

    const handle = window.setTimeout(async () => {
      try {
        const res = await api.post<ApiResponse<ValidationReport>>("/wechat/validate", { html });
        if (reqId !== reqIdRef.current) return;
        const data = res.data.data;
        // 畸形报告(缺 issues/warnings 数组)按「检查未完成」处理,
        // 不能让 undefined.length 把整个编辑器炸成白屏。
        if (
          res.data.code === 0 &&
          data &&
          Array.isArray(data.issues) &&
          Array.isArray(data.warnings)
        ) {
          setReport(data);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (reqId !== reqIdRef.current) return;
        setError(true);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => window.clearTimeout(handle);
  }, [html, debounceMs]);

  const tone = toneFor(report, loading, error);
  const style = TONE_STYLE[tone];
  const findingsCount = (report?.issues.length ?? 0) + (report?.warnings.length ?? 0);

  return (
    <>
      <button
        type="button"
        data-testid="compat-badge"
        data-tone={tone}
        onClick={() => report && findingsCount > 0 && setOpen(true)}
        disabled={!report || findingsCount === 0 || loading}
        title={
          findingsCount > 0
            ? "点击查看详细兼容性报告"
            : tone === "loading"
              ? "正在校验"
              : tone === "error"
                ? "校验请求失败"
                : "未发现兼容性问题"
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 28,
          padding: "0 8px",
          fontSize: 12,
          lineHeight: 1,
          color: style.color,
          background: style.bg,
          border: `1px solid ${style.border}`,
          borderRadius: "var(--r-pill)",
          cursor: findingsCount > 0 ? "pointer" : "default",
          fontFamily: "var(--f-mono)",
          letterSpacing: "0.02em",
        }}
      >
        {iconFor(tone)}
        {labelFor(report, tone)}
      </button>

      <ValidationDialog
        open={open}
        report={report}
        pushing={false}
        onCancel={() => setOpen(false)}
        title="公众号兼容性检查 · 实时报告"
      />
    </>
  );
}
