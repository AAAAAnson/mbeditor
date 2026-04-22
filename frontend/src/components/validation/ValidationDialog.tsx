import type { ValidationFinding, ValidationReport } from "./types";

interface ValidationDialogProps {
  open: boolean;
  report: ValidationReport | null;
  pushing: boolean;
  onCancel: () => void;
  onIgnoreAndPush: () => void;
}

function FindingRow({ finding, tone }: { finding: ValidationFinding; tone: "issue" | "warning" }) {
  const color = tone === "issue" ? "var(--danger, #e5484d)" : "var(--warn, #f5a623)";
  return (
    <li
      data-testid={tone === "issue" ? "validation-issue" : "validation-warning"}
      style={{
        padding: "10px 12px",
        borderLeft: `3px solid ${color}`,
        background: "var(--bg-2, rgba(0,0,0,0.02))",
        marginBottom: 8,
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.5 }}>
        <span style={{ fontFamily: "var(--f-mono)", color: "var(--fg-4)", marginRight: 8 }}>
          line {finding.line}
        </span>
        {finding.message}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4, lineHeight: 1.5 }}>
        → {finding.suggestion}
      </div>
    </li>
  );
}

export default function ValidationDialog({
  open,
  report,
  pushing,
  onCancel,
  onIgnoreAndPush,
}: ValidationDialogProps) {
  if (!open || !report) return null;

  const { issues, warnings } = report;
  const hasIssues = issues.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-dialog-title"
      data-testid="validation-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg, #fff)",
          color: "var(--fg, #111)",
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          borderRadius: 8,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--fg-6, rgba(0,0,0,0.08))" }}>
          <div id="validation-dialog-title" style={{ fontSize: 16, fontWeight: 600 }}>
            发布前公众号兼容性检查
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-3)", marginTop: 4 }}>
            {hasIssues
              ? `发现 ${issues.length} 处违规${warnings.length ? `，${warnings.length} 处警告` : ""}，违规项会被微信静默剥离`
              : `发现 ${warnings.length} 处警告，请人工确认`}
          </div>
        </div>

        <div style={{ padding: "14px 22px", overflowY: "auto", flex: 1 }}>
          {hasIssues && (
            <section style={{ marginBottom: warnings.length ? 16 : 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--danger, #e5484d)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                违规 · 必须修复
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {issues.map((finding, i) => (
                  <FindingRow key={`issue-${i}`} finding={finding} tone="issue" />
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--warn, #f5a623)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                警告 · 请人工确认
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {warnings.map((finding, i) => (
                  <FindingRow key={`warn-${i}`} finding={finding} tone="warning" />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--fg-6, rgba(0,0,0,0.08))",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={onCancel}
            disabled={pushing}
            data-testid="validation-cancel"
          >
            去修改
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={onIgnoreAndPush}
            disabled={pushing}
            data-testid="validation-ignore-push"
          >
            {pushing ? "推送中…" : hasIssues ? "忽略并推送" : "仍然推送"}
          </button>
        </div>
      </div>
    </div>
  );
}
