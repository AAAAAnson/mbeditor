// Hard-block modal shown when a pre-flight WeChat validator run finds
// ``issues.length > 0`` while the user is trying to 复制富文本 or 发到草稿箱.
//
// The existing ``ValidationDialog`` is a soft report (issues + optional
// "忽略并推送" escape). This one blocks by default: the primary action is
// "知道了，去修" (close). A secondary "强制继续" is only rendered when the
// caller passes ``allowForce`` (driven by a ``debug`` flag upstream) so
// normal users cannot bypass the gate.
//
// Styling follows the glass-on-dark tokens the rest of the editor uses
// (``var(--surface)``, ``var(--border)``, ``var(--accent)``, etc.) so
// the dialog feels native next to ``PublishProgress`` / ``CopyReadyDialog``.

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { ValidationIssue, ValidationReport, ValidationWarning } from "@/lib/wechat-validate";

export type ValidationBlockAction = "copy" | "draft" | "publish";

interface ValidationBlockDialogProps {
  open: boolean;
  report: ValidationReport | null;
  /** Which action was blocked — controls the header + primary button copy. */
  action: ValidationBlockAction;
  onClose: () => void;
  /** When provided + ``allowForce`` is true, a "强制继续" escape is rendered. */
  onForceContinue?: () => void;
  allowForce?: boolean;
}

const ACTION_LABEL: Record<ValidationBlockAction, { verb: string; forceLabel: string }> = {
  copy:    { verb: "复制富文本", forceLabel: "强制继续复制 (不推荐)" },
  draft:   { verb: "发到草稿箱", forceLabel: "强制继续推送 (不推荐)" },
  publish: { verb: "发布",      forceLabel: "强制继续发布 (不推荐)" },
};

function snippetFor(finding: ValidationIssue | ValidationWarning): string | null {
  const record = finding as unknown as Record<string, unknown>;
  const raw = record.context ?? record.snippet ?? record.source;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
}

function FindingEntry({
  finding,
  tone,
}: {
  finding: ValidationIssue | ValidationWarning;
  tone: "issue" | "warning";
}) {
  const accentColor = tone === "issue" ? "var(--accent)" : "var(--warn)";
  const snippet = snippetFor(finding);
  return (
    <li
      data-testid={tone === "issue" ? "validation-block-issue" : "validation-block-warning"}
      style={{
        padding: "10px 12px",
        borderLeft: `3px solid ${accentColor}`,
        background: "var(--surface-2)",
        marginBottom: 8,
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: accentColor,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {finding.rule}
        </span>
        {typeof finding.line === "number" && finding.line > 0 && (
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--fg-4)" }}>
            line {finding.line}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.6, marginTop: 4 }}>
        {finding.message}
      </div>
      {finding.suggestion && (
        <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.6, marginTop: 4 }}>
          → {finding.suggestion}
        </div>
      )}
      {snippet && (
        <pre
          style={{
            marginTop: 6,
            padding: "6px 8px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: "var(--fg-2)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {snippet}
        </pre>
      )}
    </li>
  );
}

export default function ValidationBlockDialog({
  open,
  report,
  action,
  onClose,
  onForceContinue,
  allowForce = false,
}: ValidationBlockDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open && Boolean(report), onClose);

  if (!open || !report) return null;

  const issues = report.issues;
  const warnings = report.warnings;
  const { verb, forceLabel } = ACTION_LABEL[action];
  const showForce = allowForce && typeof onForceContinue === "function";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-block-title"
      data-testid="validation-block-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 1200,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          border: "1px solid var(--line)",
          borderLeft: "4px solid var(--danger)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <div
            id="validation-block-title"
            style={{
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "var(--f-display)",
              letterSpacing: "0.02em",
            }}
          >
            {verb}前被兼容性校验拦住了
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-3)", marginTop: 6, lineHeight: 1.6 }}>
            发现 <strong style={{ color: "var(--accent)" }}>{issues.length}</strong> 处违规
            {warnings.length > 0 ? ` · ${warnings.length} 条警告` : ""}。违规项会被公众号静默剥离，请修复后再试。
          </div>
        </div>

        <div style={{ padding: "14px 22px", overflowY: "auto", flex: 1 }}>
          {issues.length > 0 && (
            <section style={{ marginBottom: warnings.length ? 16 : 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                违规 · 必须修复
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {issues.map((finding, index) => (
                  <FindingEntry key={`issue-${index}`} finding={finding} tone="issue" />
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--warn)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                警告 · 建议确认
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {warnings.map((finding, index) => (
                  <FindingEntry key={`warn-${index}`} finding={finding} tone="warning" />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div>
            {showForce && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="validation-block-force"
                onClick={onForceContinue}
                style={{ color: "var(--fg-4)", minHeight: 44 }}
              >
                {forceLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="validation-block-close"
            onClick={onClose}
            autoFocus
            style={{ minHeight: 44 }}
          >
            知道了，去修
          </button>
        </div>
      </div>
    </div>
  );
}
