// frontend/src/surfaces/editor/rewrite/SelectionRewriteToolbar.tsx
// 选中即改的 UI 层(P2 收编后):选区落在某个块级段落时浮出预设工具条,点击即把
// 一句预设指令注入统一 Agent 对话(onInstruct)——由 chat 面板/useAgentChat 承担
// 流式改写、采用/回退,本组件不再持有 rewriting/reviewing 状态机。选区跟踪 + portal
// 呈现保留(预览缩放框 transform 会劫持 fixed,必须 portal 到 body)。
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { IconRefresh, IconScissors, IconSend, IconSparkle } from "@/components/icons";

import { findRewriteBlock } from "./blockTarget";

const PRESETS = [
  { key: "polish", label: "润色", Icon: IconSparkle },
  { key: "shorten", label: "缩短", Icon: IconScissors },
  { key: "rephrase", label: "换个说法", Icon: IconRefresh },
] as const;

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  /** previewEditingEnabled:公众号效果预览且可编辑时才激活(raw 不出)。 */
  enabled: boolean;
  /** 真实窄视口:工具条改为底部通栏(触控 ≥44)。 */
  isMobile?: boolean;
  /** 把一句预设指令注入统一 Agent 对话并展开面板。 */
  onInstruct: (instruction: string) => void;
}

interface AnchorPos {
  left: number;
  top: number;
}

function anchorFor(block: HTMLElement): AnchorPos {
  // 优先锚在选区 rect(用户目光所在);选区不可用/塌陷时退回块 rect。
  // 模板的「段落」常是嵌套 section,块可能高出一屏,块底可在折叠线下。
  let rect = block.getBoundingClientRect();
  const sel = typeof document !== "undefined" ? document.getSelection() : null;
  if (sel && sel.rangeCount > 0) {
    const selRect = sel.getRangeAt(0).getBoundingClientRect();
    if (selRect.width > 0 || selRect.height > 0) rect = selRect;
  }
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const below = rect.bottom + 8;
  // 视口底部放不下就翻到上缘;最后整体 clamp 进视口,绝不画到屏幕外
  const top = below + 96 > vh ? rect.top - 56 : below;
  return {
    left: Math.min(Math.max(8, rect.left), Math.max(8, vw - 480)),
    top: Math.min(Math.max(8, top), vh - 64),
  };
}

/** 取当前作用段落的文本(选区不可用时退回整块 textContent),作预设指令的「这一段」。 */
function segmentText(block: HTMLElement): string {
  return (block.textContent ?? "").replace(/\s+/g, " ").trim();
}

export default function SelectionRewriteToolbar({ containerRef, enabled, isMobile = false, onInstruct }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [freeText, setFreeText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return;
    }
    const onSelectionChange = () => {
      // 焦点在工具条内(自由输入框)时保持目标不丢
      if (toolbarRef.current?.contains(document.activeElement)) return;
      const container = containerRef.current;
      if (!container) {
        setTarget(null);
        return;
      }
      const sel = document.getSelection();
      setTarget(findRewriteBlock(container, sel?.anchorNode ?? null));
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [enabled, containerRef]);

  if (!enabled) return null;

  const instruct = (instruction: string) => {
    onInstruct(instruction);
    setTarget(null);
    setFreeText("");
  };

  const startPreset = (label: string) => {
    if (!target) return;
    instruct(`把这一段${label}:${segmentText(target)}`);
  };

  const startFree = () => {
    const text = freeText.trim();
    if (!target || !text) return;
    instruct(`${text}(针对这段:${segmentText(target)})`);
  };

  const baseStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        padding: "10px 12px",
        borderTop: "1px solid var(--border-2)",
        background: "var(--surface)",
        boxShadow: "0 -6px 18px rgba(0,0,0,0.08)",
      }
    : {
        position: "fixed",
        zIndex: 60,
        padding: 6,
        borderRadius: 10,
        border: "1px solid var(--border-2)",
        background: "var(--surface)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      };

  const btnMin: CSSProperties = isMobile ? { minHeight: 44 } : {};

  // position:fixed 会被 transform 祖先(预览缩放框,scale(1) 也算)劫持成
  // 相对框内定位 —— portal 到 body 才是真视口坐标(2026-07-04 真机 QA 逮到)。
  const portal = (node: ReactNode) => createPortal(node, document.body);

  // ── idle:选中出工具条 ──
  if (!target) return null;
  const pos = isMobile ? {} : anchorFor(target);

  return portal(
    <div
      ref={toolbarRef}
      data-testid="rewrite-toolbar"
      role="toolbar"
      aria-label="AI 改写工具条"
      style={{
        ...baseStyle,
        ...pos,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}
    >
      {PRESETS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className="btn btn-outline btn-sm"
          aria-label={label}
          // preventDefault:按下时不抢焦点,选区不塌,click 正常触发
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => startPreset(label)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", ...btnMin }}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderLeft: "1px solid var(--border-2)",
          paddingLeft: 8,
          flex: isMobile ? "1 1 100%" : "0 0 auto",
        }}
      >
        <input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") startFree();
            if (e.key === "Escape") setTarget(null);
          }}
          placeholder="想怎么改?如:更有画面感"
          aria-label="自由改写指令"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 12,
            color: "var(--fg)",
            width: isMobile ? "100%" : 160,
            minHeight: isMobile ? 44 : undefined,
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          aria-label="发送改写指令"
          onPointerDown={(e) => e.preventDefault()}
          onClick={startFree}
          disabled={!freeText.trim()}
          style={{ padding: "4px 8px", ...btnMin }}
        >
          <IconSend size={12} />
        </button>
      </div>
    </div>
  );
}
