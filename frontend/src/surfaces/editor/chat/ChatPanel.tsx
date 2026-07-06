// frontend/src/surfaces/editor/chat/ChatPanel.tsx
// Agent 对话式编辑面板(批6,spec §1/§6)。状态机在 useAgentChat(EditorSurface
// 持有并注入),本组件只管呈现与输入:
//   桌面 = 编辑器最左侧竖栏(grid 336px 列);移动 = fixed 底部抽屉(60vh,可下滑收起)。
//   消息流 = user 气泡 / assistant 流式文本(streaming 光标)/ 工具活动条目(中文
//   动词化 + violations fix_hint 摘要)/ 系统条目 / 轮次卡(回到此轮之前)/ 汇总卡。
//   预览高亮 = turn_done 后按块序号在预览上画 2s 覆盖层(portal 到 body ——
//   预览缩放框有 transform,fixed 元素必须 portal;预览 DOM 与 draft.html 零注入)。
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, TouchEvent } from "react";
import { createPortal } from "react-dom";

import { IconAgent, IconCheck, IconChevronDown, IconClock, IconClose, IconRefresh, IconSend } from "@/components/icons";
import { LoadingDots } from "@/components/ui";
import { toast } from "@/stores/toastStore";

import RevisionHistory from "../history/RevisionHistory";
import { blockKindLabel, parseWriteToolFeedback, toolActivityLabel } from "./chatPresent";
import { locateBlockElements } from "./highlight";
import { stripChatMarkdown } from "./stripChatMarkdown";
import type { AgentChatApi, ChatEntry } from "./useAgentChat";

/** 快捷起手建议(空会话时展示,点击即发送)。 */
const SUGGESTIONS = ["帮我把标题改得更抓人", "整体换个暖色调", "行距再宽松些"] as const;

const FLASH_DURATION_MS = 2000;

export interface ChatPanelProps {
  articleId?: string;
  /** 真实窄视口(<600px):转底部抽屉。 */
  isMobile?: boolean;
  /** draft.html 是否有正文(空文章给引导,不发空块请求)。 */
  hasContent: boolean;
  /** EditorSurface 持有的 useAgentChat 实例(测试注入替身)。 */
  chat: AgentChatApi;
  /** 取当前整篇 HTML(历史版本恢复前落 restore_backup 用)。 */
  getHtml?: () => string;
  /** 回写整篇 HTML(历史版本恢复回灌编辑器)。 */
  onHtmlChange?: (html: string) => void;
  onClose: () => void;
}

interface FlashRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 最后一条 user 文本(error 重发用)。 */
function lastUserText(entries: ChatEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === "user") return e.text;
  }
  return null;
}

export default function ChatPanel({
  articleId,
  isMobile = false,
  hasContent,
  chat,
  getHtml,
  onHtmlChange,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [flashRects, setFlashRects] = useState<FlashRect[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashedEntryRef = useRef<string | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const streaming = chat.status === "streaming";
  const ready = Boolean(articleId) && hasContent;
  const canSend = ready && !streaming;

  // 新条目自动滚到底(用户目光跟住最新输出)。
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat.entries, chat.status]);

  // 预览改动块高亮(best-effort):最新一条带 changedBlocks 的 assistant 条目
  // 出现时,按块序号在预览上闪 2s 覆盖层。预览容器跨组件用 testid 查——
  // raw 预览/预览缺席时查不到,静默跳过。
  useEffect(() => {
    const target = [...chat.entries]
      .reverse()
      .find(
        (e): e is Extract<ChatEntry, { kind: "assistant" }> =>
          e.kind === "assistant" && (e.changedBlocks?.length ?? 0) > 0,
      );
    if (!target || flashedEntryRef.current === target.id) return;
    flashedEntryRef.current = target.id;

    const root = document.querySelector('[data-testid="preview-editable-content"]');
    if (!root) return;
    const els = locateBlockElements(
      root,
      (target.changedBlocks ?? []).map((b) => b.index),
      target.blockCount,
    );
    const rects = els
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
    if (rects.length === 0) return;
    setFlashRects(rects);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashRects([]), FLASH_DURATION_MS);
  }, [chat.entries]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const doSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    chat.send(trimmed);
    setInput("");
  };

  const handleRestore = (revId: string) => {
    void chat.restoreCheckpoint(revId).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "快照恢复失败,请稍后重试");
    });
  };

  // 「历史版本」:面板内展开列表层(不用 fixed 弹窗——预览缩放框内 fixed 会被
  // transform 劫持,放面板内部滚动区直接规避)。列表/恢复逻辑收敛到共享
  // RevisionHistory(恢复前统一落 restore_backup 快照)。
  const toggleHistory = () => setHistoryOpen((open) => !open);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      doSend(input);
    }
  };

  // 移动抽屉:头部下滑 >60px 收起(简单手势,不做拖拽跟手)。
  const handleTouchStart = (event: TouchEvent) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (event: TouchEvent) => {
    const startY = touchStartYRef.current;
    const y = event.touches[0]?.clientY;
    if (startY === null || y === undefined) return;
    if (y - startY > 60) {
      touchStartYRef.current = null;
      onClose();
    }
  };

  const containerStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: "60vh",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        borderTop: "1px solid var(--border-2)",
        borderRadius: "16px 16px 0 0",
      }
    : {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
      };

  const streamingAssistantId = streaming
    ? [...chat.entries].reverse().find((e) => e.kind === "assistant")?.id ?? null
    : null;

  const resendText = lastUserText(chat.entries);

  return (
    <div
      data-testid="chat-panel"
      data-variant={isMobile ? "drawer" : "sidebar"}
      className={isMobile ? "chat-drawer" : undefined}
      role="complementary"
      aria-label="AI 对话面板"
      style={containerStyle}
    >
      {/* ── 头部 ── */}
      <div
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: isMobile ? "8px 14px" : "10px 14px",
          borderBottom: "1px solid var(--line)",
          flex: "0 0 auto",
          position: "relative",
        }}
      >
        {isMobile && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--border-2)",
            }}
          />
        )}
        <span style={{ display: "inline-flex", color: "var(--accent)" }} aria-hidden>
          <IconAgent size={15} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>AI 对话</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn-ghost btn-sm"
          aria-label="历史版本"
          title="查看并恢复历史版本"
          onClick={toggleHistory}
          disabled={streaming}
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <IconClock size={13} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          aria-label="收起 AI 对话"
          onClick={onClose}
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          {isMobile ? <IconChevronDown size={13} /> : <IconClose size={12} />}
        </button>
      </div>

      {/* ── 历史版本列表层(面板内部滚动区,移动底抽屉形态同样可用)── */}
      {historyOpen && (
        <div
          data-testid="chat-history"
          style={{
            flex: "0 0 auto",
            maxHeight: "42%",
            overflowY: "auto",
            padding: "8px 14px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)" }}>历史版本</div>
          {articleId ? (
            <RevisionHistory
              variant="inline"
              articleId={articleId}
              getCurrentHtml={getHtml ?? (() => "")}
              onRestore={(html) => {
                onHtmlChange?.(html);
                setHistoryOpen(false);
              }}
              disabled={streaming}
            />
          ) : (
            <p className="chat-empty">先打开一篇文章,再查看历史版本。</p>
          )}
        </div>
      )}

      {/* ── 消息流 ── */}
      <div
        ref={listRef}
        data-testid="chat-entries"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {chat.entries.length === 0 && (
          <div style={{ padding: "8px 2px", display: "flex", flexDirection: "column", gap: 10 }}>
            {!articleId ? (
              <p className="chat-empty">先打开一篇文章,再让 AI 帮你逐段修改。</p>
            ) : !hasContent ? (
              <p className="chat-empty">
                这篇文章还没有内容。先在编辑器里写点正文,或回起稿台用 AI 生成一篇,再来对话修改。
              </p>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: "var(--fg-3)" }}>
                  想怎么改这篇文章?用一句话告诉我,我会逐块修改并实时同步到预览。
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="btn btn-outline btn-sm"
                      onClick={() => doSend(s)}
                      style={{ minHeight: isMobile ? 44 : undefined }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {chat.entries.map((entry) => (
          <ChatEntryRow
            key={entry.id}
            entry={entry}
            streaming={streaming}
            showCursor={entry.id === streamingAssistantId}
            onRestore={handleRestore}
          />
        ))}

        {/* 流中但 assistant 首 token 未到:独立思考中占位 */}
        {streaming && streamingAssistantId === null && (
          <div className="chat-toolrow" role="status" aria-label="AI 思考中">
            <LoadingDots />
            <span>正在理解你的要求…</span>
          </div>
        )}
      </div>

      {/* ── error 横幅 ── */}
      {chat.status === "error" && chat.errorMessage && (
        <div className="chat-error" role="alert" style={{ margin: "0 14px 8px", flex: "0 0 auto" }}>
          <div style={{ marginBottom: resendText ? 6 : 0 }}>{chat.errorMessage}</div>
          {resendText && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (ready) chat.send(resendText);
              }}
              style={{ minHeight: isMobile ? 44 : undefined }}
            >
              <IconRefresh size={11} /> 重发
            </button>
          )}
        </div>
      )}

      {/* ── 媒体守恒警告(H1 软加固,非阻塞):本轮疑似丢图,给一键还原,检测非阻止 ── */}
      {chat.mediaWarning && (
        <div
          className="chat-mediawarn"
          role="status"
          data-testid="chat-media-warning"
          style={{
            margin: "0 14px 8px",
            flex: "0 0 auto",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--warn)",
            background: "var(--warn-soft, var(--surface-2))",
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--fg-2)",
          }}
        >
          <div style={{ marginBottom: 6 }}>
            本次修改似乎移除了 {chat.mediaWarning.removed} 张图片/图形,可点「回到本轮之前」还原。
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {chat.lastRevId && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const revId = chat.lastRevId;
                  if (revId) handleRestore(revId);
                  chat.dismissMediaWarning();
                }}
                style={{ minHeight: isMobile ? 44 : undefined }}
              >
                <IconRefresh size={11} /> 回到本轮之前
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => chat.dismissMediaWarning()}
              style={{ minHeight: isMobile ? 44 : undefined }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* ── 输入区 ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding: "10px 14px",
          paddingBottom: isMobile ? "max(10px, env(safe-area-inset-bottom))" : 10,
          borderTop: "1px solid var(--line)",
          flex: "0 0 auto",
        }}
      >
        <textarea
          className="mb-textarea"
          aria-label="AI 对话输入"
          placeholder={ready ? "想怎么改?如:标题再抓人一点" : "先准备好文章内容再开始对话"}
          value={input}
          disabled={!ready}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          style={{ flex: 1, resize: "none", minHeight: isMobile ? 44 : 40, fontSize: 13 }}
        />
        {streaming ? (
          <button
            className="btn btn-outline btn-sm"
            aria-label="停止"
            onClick={() => chat.abort()}
            style={{ minHeight: 44 }}
          >
            停止
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            aria-label="发送"
            onClick={() => doSend(input)}
            disabled={!canSend || !input.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 44 }}
          >
            <IconSend size={12} /> 发送
          </button>
        )}
      </div>

      {/* ── 预览改动块高亮覆盖层(portal 到 body:预览缩放框是 transform 祖先,
             fixed 不 portal 会被劫持;pointer-events 关死,不挡任何交互)── */}
      {flashRects.length > 0 &&
        createPortal(
          <div aria-hidden data-testid="chat-block-flash">
            {flashRects.map((r, i) => (
              <div
                key={i}
                style={{
                  position: "fixed",
                  left: r.left - 3,
                  top: r.top - 3,
                  width: r.width + 6,
                  height: r.height + 6,
                  border: "2px solid var(--accent)",
                  borderRadius: 6,
                  background: "transparent",
                  pointerEvents: "none",
                  zIndex: 65,
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── 单条目渲染 ─────────────────────────────────────────────────────────────

function ChatEntryRow({
  entry,
  streaming,
  showCursor,
  onRestore,
}: {
  entry: ChatEntry;
  streaming: boolean;
  showCursor: boolean;
  onRestore: (revId: string) => void;
}) {
  if (entry.kind === "user") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <div className="chat-bubble-user">{entry.text}</div>
        {entry.revId && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onRestore(entry.revId!)}
            disabled={streaming}
            title="回滚到这一轮 AI 修改之前的版本"
            style={{ fontSize: 11 }}
          >
            <IconRefresh size={10} /> 回到此轮之前
          </button>
        )}
      </div>
    );
  }

  if (entry.kind === "assistant") {
    const changed = entry.changedBlocks ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <div className="chat-bubble-assistant">
          {stripChatMarkdown(entry.text)}
          {showCursor && <span className="chat-cursor" data-testid="chat-streaming-cursor" aria-hidden />}
        </div>
        {changed.length > 0 && (
          <div className="chat-card" style={{ width: "100%", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 600, color: "var(--fg-2)", marginBottom: 6 }}>
              本轮改动汇总 · {changed.length} 个块
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {changed.map((b) => (
                <li key={b.id} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-4)", flex: "0 0 auto" }}>
                    {blockKindLabel(b.kind)}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.text || "(非文本内容)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (entry.kind === "tool") {
    const label = toolActivityLabel(entry.name, entry.status, entry.args);
    const feedback = entry.status !== "running" ? parseWriteToolFeedback(entry.summary) : null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="chat-toolrow">
          {entry.status === "running" ? (
            <LoadingDots />
          ) : entry.status === "ok" ? (
            <span style={{ display: "inline-flex", color: "var(--forest)" }} aria-hidden>
              <IconCheck size={11} />
            </span>
          ) : (
            <span style={{ display: "inline-flex", color: "var(--accent)" }} aria-hidden>
              <IconClose size={11} />
            </span>
          )}
          <span>{label}</span>
        </div>
        {feedback && (
          <div className="chat-card" style={{ marginLeft: 18 }}>
            {feedback.repairs > 0 && <div>有 {feedback.repairs} 处兼容修补(已自动处理)</div>}
            {feedback.violations.map((v, i) => (
              <div key={`${v.blockId}-${i}`}>
                {v.blockId ? `块 ${v.blockId}:` : ""}
                {v.fixHint}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <div className="chat-system">{entry.text}</div>;
}
