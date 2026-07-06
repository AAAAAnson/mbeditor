// frontend/src/surfaces/editor/rewrite/ArticleRewriteMenu.tsx
// docbar「AI 改稿」菜单:标题再拟三个 / 摘要重写 / 整体换调子 / 缩到指定长度。
// - 标题 / 摘要仍是轻改:直接 /agent/rewrite 单发,写回 title/digest 字段(零改)。
// - 整体换调子 / 缩到指定长度改由「统一 Agent 对话」承担(P2 收编第一刀):点击
//   即把一句预设指令注入 chat 面板(onInstruct),由 useAgentChat 走块级管线改稿——
//   图片/SVG 原样保留、后悔统一走「回到本轮之前」检查点,不再有本组件内的
//   横条快照/整篇 SSE 直连(两套内存后悔已删)。
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
  IconSparkle,
} from "@/components/icons";
import { agentStream, type AgentStreamHandle } from "@/lib/agentStream";
import { toast } from "@/stores/toastStore";
import { getLlmConfig } from "@/surfaces/settings/llmApi";
import type { AgentEvent, AgentRewriteDoneEvent } from "@/types/agent";
import type { EditorDraft, EditorField } from "@/types";

const TONES = ["温柔治愈", "干货利落", "俏皮带梗", "克制高级"] as const;
const LENGTH_PRESETS = [800, 1200] as const;

/** html -> 纯文本(块级闭合转换行),作轻改(标题/摘要)的重写母本/上下文。 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|section|h[1-6]|li|div|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const div = document.createElement("div");
  div.innerHTML = withBreaks;
  return (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** 换调子预设指令:整体气质改、图片/SVG/结构原样保全(H1 软加固,与后端必死清单呼应)。 */
export function toneInstruction(tone: string): string {
  return `把整篇文章换成「${tone}」的调子,保留原有全部图片、SVG 和结构,只调整文字与排版气质。`;
}

/** 缩长度预设指令:保留结构与全部图片/SVG,不删图。 */
export function shortenInstruction(target: number | string): string {
  return `把全文缩到 ${target} 字左右,保留文章结构和所有图片/SVG,不要删图。`;
}

async function defaultCheckLlmReady(): Promise<boolean> {
  try {
    const cfg = await getLlmConfig();
    return cfg.keyConfigured;
  } catch {
    // 读配置失败不挡路:后端流会以 no_provider 友好兜底(与 compose 同策)
    return true;
  }
}

interface Props {
  draft: EditorDraft;
  onFieldChange: (field: EditorField, value: string) => void;
  /** 把一句预设指令注入统一 Agent 对话并展开面板(换调子/缩长度走这条)。 */
  onInstruct: (instruction: string) => void;
  /** 注入流客户端/就绪检查,测试用(仅标题/摘要轻改用)。 */
  stream?: typeof agentStream;
  checkLlmReady?: () => Promise<boolean>;
}

type DialogState =
  | null
  | { kind: "title"; status: "loading" | "ready"; variants: string[] }
  | { kind: "digest"; status: "loading" | "ready"; text: string }
  | { kind: "length" };

const dialogShell: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(26,21,18,0.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 80,
};

const dialogCard: CSSProperties = {
  background: "var(--surface)",
  borderRadius: 12,
  border: "1px solid var(--border-2)",
  padding: 20,
  width: "min(520px, calc(100vw - 32px))",
  maxHeight: "min(70vh, 560px)",
  overflow: "auto",
  boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
};

export default function ArticleRewriteMenu({
  draft,
  onFieldChange,
  onInstruct,
  stream = agentStream,
  checkLlmReady = defaultCheckLlmReady,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [customLength, setCustomLength] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<AgentStreamHandle | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
      setToneOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // 卸载/切文章:中止在途流(标题/摘要轻改)
  useEffect(() => () => handleRef.current?.abort(), []);

  const articleText = (): string => {
    const d = draftRef.current;
    if (d.mode === "markdown" && d.markdown.trim()) return d.markdown;
    return htmlToPlainText(d.html);
  };

  const guardReady = async (): Promise<boolean> => {
    const ready = await checkLlmReady();
    if (!ready) {
      toast.info("先连接 AI 才能改稿:设置 → 写作 → AI 引擎,或在「让 AI 帮我写」里完成向导");
    }
    return ready;
  };

  const closeDialog = () => {
    handleRef.current?.abort();
    setDialog(null);
  };

  // ── 整体大改(换调子 / 缩长度)= 注入指令进统一 Agent 对话 ──
  const runTone = (tone: string) => {
    setMenuOpen(false);
    setToneOpen(false);
    onInstruct(toneInstruction(tone));
  };

  const runShorten = (target: number | string) => {
    setDialog(null);
    onInstruct(shortenInstruction(target));
  };

  // ── 标题再拟三个 ──
  const runTitle = async () => {
    setMenuOpen(false);
    if (!(await guardReady())) return;
    setDialog({ kind: "title", status: "loading", variants: [] });
    handleRef.current = stream(
      "/api/v1/agent/rewrite",
      { scope: "title", title: draftRef.current.title, article_text: articleText() },
      {
        onEvent: (event: AgentEvent) => {
          if (event.type === "rewrite_done") {
            const variants = (event as AgentRewriteDoneEvent).variants;
            if (variants.length === 0) {
              toast.error("AI 没给出候选标题,再试一次");
              setDialog(null);
              return;
            }
            setDialog({ kind: "title", status: "ready", variants });
          } else if (event.type === "error") {
            toast.error(event.message);
            setDialog(null);
          }
        },
        onError: (message) => {
          toast.error(message);
          setDialog(null);
        },
      },
    );
  };

  // ── 摘要重写 ──
  const runDigest = async () => {
    setMenuOpen(false);
    if (!(await guardReady())) return;
    setDialog({ kind: "digest", status: "loading", text: "" });
    handleRef.current = stream(
      "/api/v1/agent/rewrite",
      { scope: "digest", title: draftRef.current.title, article_text: articleText() },
      {
        onEvent: (event: AgentEvent) => {
          if (event.type === "token") {
            setDialog((prev) =>
              prev?.kind === "digest" ? { ...prev, text: prev.text + event.text } : prev,
            );
          } else if (event.type === "rewrite_done") {
            setDialog({ kind: "digest", status: "ready", text: event.text });
          } else if (event.type === "error") {
            toast.error(event.message);
            setDialog(null);
          }
        },
        onError: (message) => {
          toast.error(message);
          setDialog(null);
        },
      },
    );
  };

  const itemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 12px",
    fontSize: 12.5,
    color: "var(--fg)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    minHeight: 40,
  };

  return (
    <>
      <div ref={menuRef} style={{ position: "relative", display: "inline-flex" }}>
        <button
          className="btn btn-outline btn-sm"
          data-testid="article-rewrite-menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          disabled={Boolean(dialog)}
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <IconSparkle size={13} /> AI 改稿{" "}
          {menuOpen ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />}
        </button>
        {menuOpen && (
          <div
            data-testid="article-rewrite-dropdown"
            role="menu"
            aria-label="AI 改稿"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 70,
              minWidth: 190,
              padding: 4,
              borderRadius: 10,
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
            }}
          >
            <button role="menuitem" style={itemStyle} onClick={() => void runTitle()}>
              标题再拟三个
            </button>
            <button role="menuitem" style={itemStyle} onClick={() => void runDigest()}>
              摘要重写
            </button>
            <button
              role="menuitem"
              aria-expanded={toneOpen}
              style={itemStyle}
              onClick={() => setToneOpen((v) => !v)}
            >
              整体换调子 {toneOpen ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />}
            </button>
            {toneOpen &&
              TONES.map((tone) => (
                <button
                  key={tone}
                  role="menuitem"
                  style={{ ...itemStyle, paddingLeft: 26 }}
                  onClick={() => runTone(tone)}
                >
                  {tone}
                </button>
              ))}
            <button
              role="menuitem"
              style={itemStyle}
              onClick={() => {
                setMenuOpen(false);
                setDialog({ kind: "length" });
              }}
            >
              缩到指定长度
            </button>
          </div>
        )}
      </div>

      {/* ── 标题候选对话框 ── */}
      {dialog?.kind === "title" && (
        <div style={dialogShell} role="dialog" aria-label="标题再拟三个" data-testid="title-variants-dialog">
          <div style={dialogCard}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>标题再拟三个</div>
            {dialog.status === "loading" ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--fg-3)", padding: "18px 0" }}>
                AI 正在想标题…
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {dialog.variants.map((v) => (
                  <button
                    key={v}
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      onFieldChange("title", v);
                      setDialog(null);
                    }}
                    style={{ justifyContent: "flex-start", textAlign: "left", minHeight: 44 }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={closeDialog}>
                都不要
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 摘要对话框 ── */}
      {dialog?.kind === "digest" && (
        <div style={dialogShell} role="dialog" aria-label="摘要重写" data-testid="digest-dialog">
          <div style={dialogCard}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>摘要重写</div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                fontSize: 13,
                lineHeight: 1.7,
                minHeight: 56,
                whiteSpace: "pre-wrap",
              }}
            >
              {dialog.text || "AI 正在写摘要…"}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={closeDialog}>
                取消
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={dialog.status !== "ready"}
                onClick={() => void runDigest()}
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <IconRefresh size={12} /> 再来一版
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={dialog.status !== "ready"}
                onClick={() => {
                  onFieldChange("digest", dialog.text);
                  setDialog(null);
                }}
              >
                用这条
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 缩长度选择 ── */}
      {dialog?.kind === "length" && (
        <div style={dialogShell} role="dialog" aria-label="缩到指定长度" data-testid="length-dialog">
          <div style={dialogCard}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>缩到指定长度</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LENGTH_PRESETS.map((n) => (
                <button
                  key={n}
                  className="btn btn-outline btn-sm"
                  style={{ minHeight: 44 }}
                  onClick={() => runShorten(n)}
                >
                  约 {n} 字
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  value={customLength}
                  onChange={(e) => setCustomLength(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="自定义"
                  aria-label="自定义字数"
                  inputMode="numeric"
                  style={{
                    width: 84,
                    padding: "8px 10px",
                    border: "1px solid var(--border-2)",
                    borderRadius: 8,
                    fontSize: 13,
                    background: "var(--surface)",
                    color: "var(--fg)",
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!customLength || Number(customLength) < 50}
                  style={{ minHeight: 44 }}
                  onClick={() => runShorten(customLength)}
                >
                  开始
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDialog(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
