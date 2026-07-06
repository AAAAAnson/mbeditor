import type { ReactNode } from "react";

interface SectionHeaderProps {
  /** Big serif title rendered as an <h2> (heading role). */
  title: string;
  /** Small uppercase orange eyebrow above the title. Falls back to `title`. */
  eyebrow?: string;
  /** Optional leading icon shown before the eyebrow text. */
  eyebrowIcon?: ReactNode;
  /** Optional supporting paragraph below the title. */
  sub?: string;
  /** Max width of the supporting paragraph; defaults to 560 to match the other sections. */
  subMaxWidth?: number;
}

/**
 * Shared设置 section header(eyebrow + 标题 + 说明)。
 * 从各 section 自抄的 header 提取而来,渲染输出与旧 inline 版本一致:
 * eyebrow 缺省时回退到 title(承接 GatewaySection/EditorSection/AboutSection 旧行为)。
 */
export default function SectionHeader({ title, eyebrow, eyebrowIcon, sub, subMaxWidth = 560 }: SectionHeaderProps) {
  // eyebrow 缺省时回退到 title;但当回退值与 title 完全相同时(如「关于」分组名=叶子名),
  // 面包屑会塌成与正下方 H1 重复的单段 —— 此时省略 eyebrow,只保留 title。
  const eyebrowText = eyebrow ?? title;
  const showEyebrow = eyebrowText !== title;
  return (
    <div style={{ marginBottom: 24 }}>
      {showEyebrow && (
        <div
          className="label-soft"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "var(--orange-600)",
            marginBottom: 12,
          }}
        >
          {eyebrowIcon}
          {eyebrowText}
        </div>
      )}
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--f-display)",
          fontWeight: 700,
          fontSize: 27,
          lineHeight: 1.2,
          color: "var(--ink-strong)",
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            margin: "9px 0 0",
            maxWidth: subMaxWidth,
            color: "var(--ink-soft)",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
