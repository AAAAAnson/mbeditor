import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
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
  ok:      { color: "#1a7f4e", bg: "rgba(26,127,78,0.08)",  border: "rgba(26,127,78,0.25)"  },
  warn:    { color: "#a36400", bg: "rgba(245,166,35,0.10)", border: "rgba(245,166,35,0.30)" },
  issue:   { color: "#a3242a", bg: "rgba(229,72,77,0.10)",  border: "rgba(229,72,77,0.30)"  },
  loading: { color: "var(--fg-4)", bg: "transparent", border: "var(--fg-6, rgba(0,0,0,0.10))" },
  error:   { color: "var(--fg-4)", bg: "transparent", border: "var(--fg-6, rgba(0,0,0,0.10))" },
};

function labelFor(report: ValidationReport | null, tone: Tone): string {
  if (tone === "loading") return "检查中…";
  if (tone === "error") return "检查未完成";
  if (!report) return "✓ 兼容";
  const { issues, warnings } = report;
  if (issues.length > 0) return `✕ ${issues.length} 违规${warnings.length ? ` · ${warnings.length} 警告` : ""}`;
  if (warnings.length > 0) return `⚠ ${warnings.length} 警告`;
  return "✓ 兼容";
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
        if (res.data.code === 0 && res.data.data) {
          setReport(res.data.data);
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
          height: 24,
          padding: "0 8px",
          fontSize: 12,
          lineHeight: 1,
          color: style.color,
          background: style.bg,
          border: `1px solid ${style.border}`,
          borderRadius: 12,
          cursor: findingsCount > 0 ? "pointer" : "default",
          fontFamily: "var(--f-mono)",
          letterSpacing: "0.02em",
        }}
      >
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
