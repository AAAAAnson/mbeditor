// Small side panel that renders the current WeChat compatibility report.
//
// Subscribes to ``useWechatLint(html)`` and groups findings by rule +
// tone (issue / warning). Clicking an entry invokes ``onHighlight`` with
// the finding's textual context so the surrounding editor can scroll
// or flash the offending source substring (best-effort; the caller
// decides how to implement it).
//
// The panel is intentionally collapsible so it can coexist with the
// existing StructurePanel / CenterStage layout without stealing space
// from the editor. Styling uses the Warm Walnut tokens so it blends
// with the rest of the surface.

import { useMemo, useState } from "react";
import { useWechatLint } from "./useWechatLint";
import type { ValidationIssue, ValidationWarning } from "@/lib/wechat-validate";

interface LintSidebarProps {
  html: string;
  /** Disable network calls (e.g. no article loaded). */
  enabled?: boolean;
  /**
   * Called when the user clicks a finding. ``hint`` is a best-effort
   * substring from the finding's context / message that the caller can
   * ``indexOf`` inside the source textarea to locate + highlight.
   */
  onHighlight?: (hint: string, finding: ValidationIssue | ValidationWarning) => void;
}

function snippetFor(finding: ValidationIssue | ValidationWarning): string | null {
  const record = finding as unknown as Record<string, unknown>;
  const raw = record.context ?? record.snippet ?? record.source;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

function highlightHintFor(finding: ValidationIssue | ValidationWarning): string {
  const snippet = snippetFor(finding);
  if (snippet) return snippet;
  // Fall back to a token pulled from the message, e.g. strip the surrounding
  // prose: 'attributeName="fooBar" 不在白名单内' → 'fooBar' is the best needle.
  const quoted = finding.message.match(/["'`]([^"'`]+)["'`]/);
  if (quoted?.[1]) return quoted[1];
  const attrEq = finding.message.match(/([a-zA-Z-]+)\s*=\s*["']([^"']+)["']/);
  if (attrEq?.[0]) return attrEq[0];
  return finding.message;
}

function FindingRow({
  finding,
  tone,
  onHighlight,
}: {
  finding: ValidationIssue | ValidationWarning;
  tone: "issue" | "warning";
  onHighlight?: LintSidebarProps["onHighlight"];
}) {
  const color = tone === "issue" ? "var(--accent)" : "var(--warn)";
  const snippet = snippetFor(finding);
  const clickable = typeof onHighlight === "function";

  return (
    <li
      data-testid={tone === "issue" ? "lint-issue" : "lint-warning"}
      style={{
        padding: "8px 10px",
        borderLeft: `3px solid ${color}`,
        background: "var(--surface-2)",
        marginBottom: 6,
        borderRadius: 4,
        cursor: clickable ? "pointer" : "default",
      }}
      onClick={() => {
        if (!clickable) return;
        onHighlight!(highlightHintFor(finding), finding);
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 10,
            color,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {finding.rule}
        </span>
        {typeof finding.line === "number" && finding.line > 0 && (
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--fg-4)" }}>
            L{finding.line}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, marginTop: 3 }}>
        {finding.message}
      </div>
      {snippet && (
        <div
          style={{
            marginTop: 4,
            padding: "4px 6px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            fontFamily: "var(--f-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {snippet}
        </div>
      )}
    </li>
  );
}

export default function LintSidebar({ html, enabled = true, onHighlight }: LintSidebarProps) {
  const { issues, warnings, running, error } = useWechatLint(html, { enabled });
  // 默认折叠(44px):把横向空间让给 Monaco;要看校验清单点开即可。
  const [collapsed, setCollapsed] = useState(true);

  const summary = useMemo(() => {
    if (error) return "校验服务离线";
    if (running) return "校验中…";
    if (issues.length === 0 && warnings.length === 0) return "全部合规";
    const parts: string[] = [];
    if (issues.length > 0) parts.push(`${issues.length} 违规`);
    if (warnings.length > 0) parts.push(`${warnings.length} 警告`);
    return parts.join(" · ");
  }, [issues.length, warnings.length, running, error]);

  const tone = issues.length > 0 ? "issue" : warnings.length > 0 ? "warn" : "ok";
  const toneColor =
    tone === "issue" ? "var(--accent)" : tone === "warn" ? "var(--warn)" : "var(--forest)";

  return (
    <aside
      data-testid="lint-sidebar"
      style={{
        width: collapsed ? 44 : 260,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        transition: "width 180ms ease",
        minHeight: 0,
      }}
    >
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid="lint-sidebar-toggle"
        onClick={() => setCollapsed((prev) => !prev)}
        title={collapsed ? "展开兼容性校验" : "收起兼容性校验"}
        style={{
          all: "unset",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          background: "var(--surface-2)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: toneColor,
            flexShrink: 0,
          }}
        />
        {!collapsed && (
          <>
            {/* .caps 的 0.18em 字距是为拉丁大写设计,套到中文标题字距过松;
                收紧到 0.04em 与右侧 summary 一致、对齐全站中文标签。 */}
            <span
              className="caps"
              style={{ flex: 1, fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.04em" }}
            >
              兼容性校验
            </span>
            <span
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 10,
                color: toneColor,
                letterSpacing: "0.04em",
              }}
            >
              {summary}
            </span>
          </>
        )}
      </button>

      {!collapsed && (
        <div
          data-testid="lint-sidebar-body"
          style={{ flex: 1, overflowY: "auto", padding: "10px 12px", minHeight: 0 }}
        >
          {error && (
            <div
              style={{
                padding: "8px 10px",
                marginBottom: 8,
                background: "var(--warn-soft)",
                color: "var(--warn)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              校验服务暂不可用 · 已自动跳过
            </div>
          )}

          {!error && issues.length === 0 && warnings.length === 0 && (
            <div
              style={{
                padding: "10px 6px",
                color: "var(--fg-4)",
                fontSize: 12,
                lineHeight: 1.6,
                textAlign: "center",
              }}
            >
              {running ? "正在校验公众号兼容性…" : "当前内容未发现兼容性问题。"}
            </div>
          )}

          {issues.length > 0 && (
            <section style={{ marginBottom: warnings.length ? 10 : 0 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--accent)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                违规 · {issues.length}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {issues.map((finding, index) => (
                  <FindingRow
                    key={`issue-${index}`}
                    finding={finding}
                    tone="issue"
                    onHighlight={onHighlight}
                  />
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--warn)",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                警告 · {warnings.length}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {warnings.map((finding, index) => (
                  <FindingRow
                    key={`warn-${index}`}
                    finding={finding}
                    tone="warning"
                    onHighlight={onHighlight}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
